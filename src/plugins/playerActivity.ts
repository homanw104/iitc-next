/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";
import { CustomDataSource } from "cesium";
import { getTeamColor } from "../utils/color";

type Team = "ENLIGHTENED" | "RESISTANCE" | "MACHINA";

interface Player {
  name: string;
  team: Team;
}

interface Portal {
  name: string;
  latE6: number;
  lngE6: number
}

interface PlayerActivity {
  timestamp: number;
  weight: number;
  lat: number;
  lng: number;
  team: Team;
}

class PlayerActivityPlugin {
  public id = "player-activity-tracker";
  public name = "Player Activity Tracker";
  public description = "Adds two layers to the map for players and their activity.";

  private dataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-enl");
  private dataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-res");
  private playerLocations: Map<string, Cesium.Entity> = new Map();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private interval: number | undefined;

  private viewer: IITCCore["viewer"] = safeWindow ? (safeWindow as any).iitc?.viewer : undefined;
  private logManager: IITCCore["logManager"] = safeWindow ? (safeWindow as any).iitc?.logManager : undefined;
  private layerManager: IITCCore["layerManager"] = safeWindow ? (safeWindow as any).iitc?.layerManager : undefined;
  private commManager: IITCCore["commManager"] = safeWindow ? (safeWindow as any).iitc?.commManager : undefined;

  public init() {
    if (safeWindow) {
      const iitc = (safeWindow as any).iitc;
      this.viewer = iitc.viewer;
      this.logManager = iitc.logManager;
      this.layerManager = iitc.layerManager;
      this.commManager = iitc.commManager;
    }

    if (!this.viewer || !this.layerManager || !this.logManager || !this.commManager) {
      console.warn("[WARN][PlayerActivityPlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        commManager: !!this.commManager
      });
      return;
    }

    this.dataSourceEnl = new Cesium.CustomDataSource("player-activity-enl");
    this.dataSourceRes = new Cesium.CustomDataSource("player-activity-res");
    this.viewer.dataSources.add(this.dataSourceEnl).then();
    this.viewer.dataSources.add(this.dataSourceRes).then();
    this.setUpDataSource(this.dataSourceEnl);
    this.setUpDataSource(this.dataSourceRes);

    this.interval = setInterval(() => this.updatePlayerActivity(), 4000);
    this.updatePlayerActivity();
  }

  public deinit() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    this.viewer?.dataSources.remove(this.dataSourceEnl, true);
    this.viewer?.dataSources.remove(this.dataSourceRes, true);
    this.dataSourceEnl.entities.removeAll();
    this.dataSourceRes.entities.removeAll();
    this.playerPaths.clear();
    this.playerLocations.clear();
  }

  private setUpDataSource(source: Cesium.DataSource) {
    source.clustering.enabled = true;
    source.clustering.pixelRange = 10;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      const players: Player[] = clusteredEntities.map(e => {
        return {
          name: e.properties?.name.getValue(),
          team: e.properties?.team.getValue(),
        };
      });
      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.id = cluster;
      cluster.billboard.image = this.buildCanvas(players)?.toDataURL() || "";
      cluster.billboard.eyeOffset = new Cesium.Cartesian3(0, 0, -1);
    });
  }

  private updatePlayerActivity(): void {
    const playerActivities: Map<string, PlayerActivity[]> = new Map();

    this.commManager?.getMessages("all")?.forEach((msg: any) => {
      let player: Player | null = null;
      let portal: Portal | null = null;

      for (let i = 0; i < msg.markup.length - 2; i++) {
        if (msg.markup[i][0] === "PLAYER") {
          player = { name: msg.markup[i][1].plain, team: msg.markup[i][1].team };
        } else if (msg.markup[i][0] === "PORTAL") {
          portal = { name: msg.markup[i][1].name, latE6: msg.markup[i][1].latE6, lngE6: msg.markup[i][1].lngE6 };
          break;  // Only take first portal found in message
        }
      }

      if (player && portal) {
        const activity = {
          timestamp: msg.timestamp,
          weight: 1,
          lat: portal.latE6 / 1e6,
          lng: portal.lngE6 / 1e6,
          team: player.team,
        }

        let activities = playerActivities.get(player.name) || [];
        if (activities.length === 0) playerActivities.set(player.name, activities);

        const existing = activities.find(a => a.timestamp === activity.timestamp);
        const existingIndex = activities.findIndex((a) => a.timestamp === existing?.timestamp);

        if (existing) {
          // Calculate the average location and replace the found activity
          activities[existingIndex] = {
            timestamp: existing.timestamp,
            weight: existing.weight + 1,
            lat: (existing.lat * existing.weight + activity.lat) / (existing.weight + 1),
            lng: (existing.lng * existing.weight + activity.lng) / (existing.weight + 1),
            team: existing.team,
          };
        } else {
          // Push the activity into the list
          activities.push(activity);
          activities.sort((a, b) => a.timestamp - b.timestamp);
        }
        playerActivities.set(player.name, activities);
      }
    });

    this.renderPlayerLocations(playerActivities);
    this.renderPlayerPaths(playerActivities);
  };

  private renderPlayerLocations(playerActivities: Map<string, PlayerActivity[]>): void {
    playerActivities.forEach((activities, playerName) => {
      const lastActivity = activities[activities.length - 1];
      const lastPosition = Cesium.Cartesian3.fromDegrees(lastActivity.lng, lastActivity.lat);

      let source: CustomDataSource;
      if (lastActivity.team === "ENLIGHTENED") source = this.dataSourceEnl;
      else if (lastActivity.team === "RESISTANCE") source = this.dataSourceRes;
      else return;

      let entity = this.playerLocations.get(playerName);
      if (!entity) {
        entity = source.entities.add({
          position: lastPosition,
          billboard: {
            image: this.buildCanvas([{ name: playerName, team: lastActivity.team }]),
            eyeOffset: new Cesium.Cartesian3(0, 0, -1),
          },
          properties: {
            name: playerName,
            team: lastActivity.team,
          },
        });
      } else {
        entity.position = new Cesium.ConstantPositionProperty(lastPosition);
      }
      this.playerLocations.set(playerName, entity);
    });
  }

  private renderPlayerPaths(playerActivities: Map<string, PlayerActivity[]>): void {
    playerActivities.forEach((activities, playerName) => {
      const lastActivity = activities[activities.length - 1];
      const positions = activities.map(a => Cesium.Cartesian3.fromDegrees(a.lng, a.lat));

      let source: CustomDataSource;
      if (lastActivity.team === "ENLIGHTENED") source = this.dataSourceEnl;
      else if (lastActivity.team === "RESISTANCE") source = this.dataSourceRes;
      else return;

      let entity = this.playerPaths.get(playerName);
      if (!entity) {
        entity = source.entities.add({
          polyline: {
            positions: positions,
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString("#E130DE").withAlpha(0.9),
              dashLength: 12,
            }),
          }
        });
      } else {
        if (entity.polyline) entity.polyline.positions = new Cesium.ConstantProperty(positions);
      }
      this.playerPaths.set(playerName, entity);
    })
  }

  private buildCanvas(players: Player[]): HTMLCanvasElement | undefined {
    const CANVAS_PX = 512;    // billboard size in screen pixels
    const PADDING = 240;      // padding around the focus square
    const BRACKET_LEN = 0.16; // bracket arm as fraction of the canvas half-side
    const THICKNESS = 3;
    const COLOR = "#ffd200";

    // Create a new canvas
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;

    // Create a context for the new canvas
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the canvas and set line styles
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = THICKNESS;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

    // Set up vertex positions
    const pad = PADDING;
    const half = CANVAS_PX / 2;
    const pts = [
      { x: pad, y: half },              // Left
      { x: half, y: pad },              // Top
      { x: CANVAS_PX - pad,  y: half }, // Right
      { x: half, y: CANVAS_PX-pad },    // Bottom
    ];

    // Arm length in pixels = fraction of half-diagonal
    const arm = Math.round((half - pad) * BRACKET_LEN * 2);

    // Calculate unit lengths from a to b
    function unit(a: {x: number, y: number}, b: {x: number, y: number}) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: dx/len, y: dy/len };
    }

    // For each vertex i, find the two adjacent vertices
    for (let i = 0; i < 4; i++) {
      const prev = pts[(i + 3) % 4];
      const cur = pts[i];
      const next = pts[(i + 1) % 4];

      const d1 = unit(cur, prev);  // direction toward previous vertex (inward arm 1)
      const d2 = unit(cur, next);  // direction toward next vertex (inward arm 2)

      ctx.beginPath();
      ctx.moveTo(cur.x + d1.x * arm, cur.y + d1.y * arm);
      ctx.lineTo(cur.x, cur.y);
      ctx.lineTo(cur.x + d2.x * arm, cur.y + d2.y * arm);
      ctx.stroke();
    }

    // Compile names line by line
    ctx.font = "16px coda_regular, arial, helvetica, sans-serif";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;

    // startY = half + fontSize / 2 - margin;
    let startY = half + 8 - 2;
    const lineSpacing = 20;

    // Players are grouped by enlightened and resistance layers
    // So we can infer properties from the first player of the list
    const offset = players[0].team === "ENLIGHTENED" ? 24 : -24;
    ctx.textAlign = players[0].team === "ENLIGHTENED" ? "left" : "right";
    ctx.fillStyle = players[0].team === "ENLIGHTENED" ?
      getTeamColor("ENLIGHTENED").toCssColorString() :
      getTeamColor("RESISTANCE").toCssColorString();

    players.slice(0, 5).forEach((player) => {
      const labelText = player.name || "";
      ctx.strokeText(labelText, half + offset, startY);
      ctx.fillText(labelText, half + offset, startY);
      startY += lineSpacing;
    });

    if (players.length > 5) {
      ctx.strokeText("...", half + offset, startY);
      ctx.fillText("...", half + offset, startY);
    }

    return canvas;
  }
}

const register = () => {
  if (safeWindow && (safeWindow as any).iitc && (safeWindow as any).iitc.pluginManager) {
    (safeWindow as any).iitc.pluginManager.registerPlugin(new PlayerActivityPlugin());
  } else {
    setTimeout(register, 1000);
  }
};

register();
