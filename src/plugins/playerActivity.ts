/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import { CustomDataSource } from "cesium";
import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";
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

  private viewer: IITCCore["viewer"] = safeWindow ? safeWindow.iitc?.viewer : undefined;
  private logManager: IITCCore["logManager"] = safeWindow ? safeWindow.iitc?.logManager : undefined;
  private layerManager: IITCCore["layerManager"] = safeWindow ? safeWindow.iitc?.layerManager : undefined;
  private commManager: IITCCore["commManager"] = safeWindow ? safeWindow.iitc?.commManager : undefined;

  private dataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-enl");
  private dataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-res");
  private playerLocations: Map<string, Cesium.Entity> = new Map();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private onReceiveMsgCallback: () => void = () => {};

  public init() {
    if (safeWindow) {
      const iitc: IITCCore = safeWindow.iitc;
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

    this.dataSourceEnl = this.layerManager.getOrCreateSourceAndFilter("Player Activity Enl");
    this.dataSourceRes = this.layerManager.getOrCreateSourceAndFilter("Player Activity Res");
    this.setUpDataSource(this.dataSourceEnl);
    this.setUpDataSource(this.dataSourceRes);

    this.onReceiveMsgCallback = () => {this.updatePlayerActivity();};
    this.commManager.setOnReceiveMsgCallback(this.onReceiveMsgCallback);
    this.updatePlayerActivity();
  }

  public deinit() {
    this.commManager?.unsetOnReceiveMsgCallback(this.onReceiveMsgCallback);
    this.layerManager?.removeSourceAndFilter("Player Activity Enl");
    this.layerManager?.removeSourceAndFilter("Player Activity Res");
    this.playerPaths.clear();
    this.playerLocations.clear();
  }

  private setUpDataSource(source: Cesium.DataSource) {
    const hiddenEntities: Set<Cesium.Entity> = new Set();

    source.clustering.enabled = true;
    source.clustering.pixelRange = 40;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterPoints = true;
    source.clustering.clusterLabels = false;
    source.clustering.clusterBillboards = false;
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
      cluster.billboard.eyeOffset = new Cesium.Cartesian3(0, 0, -2);

      // Loop through all entities assigned to this cluster and hide their original billboards
      clusteredEntities.forEach(entity => {
        if (entity.billboard) {
          entity.billboard.show = new Cesium.ConstantProperty(false);
          hiddenEntities.add(entity);
        }
      });
    });

    // Temporary solution to show declustered player locations when moving
    this.viewer?.camera.moveStart.addEventListener(function() {
      hiddenEntities.forEach(entity => {
        if (entity.billboard) {
          entity.billboard.show = new Cesium.ConstantProperty(true);
          hiddenEntities.delete(entity);
        }
      });
    });
    this.viewer?.camera.moveEnd.addEventListener(function() {
      hiddenEntities.forEach(entity => {
        if (entity.billboard) {
          entity.billboard.show = new Cesium.ConstantProperty(true);
          hiddenEntities.delete(entity);
        }
      });
    });
  }

  private updatePlayerActivity(): void {
    const playerActivities: Map<string, PlayerActivity[]> = new Map();

    this.commManager?.getMessages("all")?.forEach((msg) => {
      let player: Player | null = null;
      let portal: Portal | null = null;

      for (let i = 0; i < msg.markup.length; i++) {
        if (msg.markup[i][0] === "PLAYER") {
          const name = msg.markup[i][1].plain;
          const team = msg.markup[i][1].team as Team;
          player = { name, team };
        } else if (msg.markup[i][0] === "PORTAL") {
          const name = msg.markup[i][1].name || null;
          const latE6 = msg.markup[i][1].latE6 || null;
          const lngE6 = msg.markup[i][1].lngE6 || null;
          if (!name || !latE6 || !lngE6) continue;
          portal = { name, latE6, lngE6 };
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
        };

        const activities = playerActivities.get(player.name) || [];
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
    this.viewer?.scene.requestRender();
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
          point: {
            pixelSize: 1,
            color: Cesium.Color.TRANSPARENT // Completely hidden, used only as a mathematical anchor
          },
          billboard: {
            image: this.buildCanvas([{ name: playerName, team: lastActivity.team }]),
            eyeOffset: new Cesium.Cartesian3(0, 0, -2),
            width: 5.12,
            height: 5.12,
            scale: 100,
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
      const coordinates: number[] = [];
      activities.map(a => coordinates.push(a.lng, a.lat, 3));

      const positions = Cesium.Cartesian3.fromDegreesArrayHeights(coordinates);

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
    });
  }

  private buildCanvas(players: Player[]): HTMLCanvasElement | undefined {
    const CANVAS_PX = 512;    // billboard size in screen pixels
    const PADDING = 240;      // padding around the focus square
    const BRACKET_LEN = 0.16; // bracket arm as fraction of the canvas half-side
    const THICKNESS = 3;
    const BORDER = 4;
    const COLOR = "#ffd200";

    // Create a new canvas
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;

    // Create a context for the new canvas
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);

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

      ctx.lineCap = "square";
      ctx.lineJoin = "miter";

      ctx.beginPath();
      ctx.moveTo(cur.x + d1.x * arm, cur.y + d1.y * arm);
      ctx.lineTo(cur.x, cur.y);
      ctx.lineTo(cur.x + d2.x * arm, cur.y + d2.y * arm);

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = THICKNESS + BORDER;
      ctx.stroke();

      ctx.strokeStyle = COLOR;
      ctx.lineWidth = THICKNESS;
      ctx.stroke();
    }

    // Compile names line by line
    ctx.font = "16px coda_regular, arial, helvetica, sans-serif";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = BORDER;

    // startY = half + fontSize / 2 - margin;
    let startY = half + 8 - 3;
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
      ctx.strokeText(`(${players.length - 5} more)`, half + offset, startY);
      ctx.fillText(`(${players.length - 5} more)`, half + offset, startY);
    }

    return canvas;
  }
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new PlayerActivityPlugin());
  } else {
    setTimeout(register, 1000);
  }
};

register();
