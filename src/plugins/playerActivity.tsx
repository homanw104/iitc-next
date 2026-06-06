/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import { CustomDataSource } from "cesium";
import { h } from "../utils/dom.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";
import { getTeamColor } from "../utils/color";
import { PlextMark } from "../managers/commManager";
import "../types/iitc.ts";

type Team = "ENLIGHTENED" | "RESISTANCE" | "MACHINA" | "NEUTRAL";

interface Player {
  name: string;
  team: Team;
}

interface Portal {
  name: string;
  latE6: number;
  lngE6: number;
}

interface PlayerActivity {
  name: string;
  team: Team;
  timestamp: number;
  weight: number;
  portalName: string;
  lat: number;
  lng: number;
}

class PlayerActivityPlugin {
  public id = "player-activity-tracker";
  public name = "Player Activity Tracker";
  public description = "Adds two layers to the map for players and their activity.";

  private viewer: IITCCore["viewer"] = safeWindow ? safeWindow.iitc?.viewer : undefined;
  private logManager: IITCCore["logManager"] = safeWindow ? safeWindow.iitc?.logManager : undefined;
  private layerManager: IITCCore["layerManager"] = safeWindow ? safeWindow.iitc?.layerManager : undefined;
  private interfaceManager: IITCCore["interfaceManager"] = safeWindow ? safeWindow.iitc?.interfaceManager : undefined;
  private commManager: IITCCore["commManager"] = safeWindow ? safeWindow.iitc?.commManager : undefined;

  private dataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-enl");
  private dataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-res");
  private playerLocations: Map<string, Cesium.Entity> = new Map();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private onReceiveCommMsgCallback: () => void = () => {};

  private tooltipEl: HTMLElement | null = null;
  private hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  private hoverAction: Cesium.ScreenSpaceEventHandler.MotionEventCallback = () => {};

  public init() {
    if (safeWindow) {
      const iitc: IITCCore = safeWindow.iitc;
      this.viewer = iitc.viewer;
      this.logManager = iitc.logManager;
      this.layerManager = iitc.layerManager;
      this.interfaceManager = iitc.interfaceManager;
      this.commManager = iitc.commManager;
    }

    if (!this.viewer || !this.layerManager || !this.interfaceManager || !this.logManager || !this.commManager) {
      console.warn("[WARN][PlayerActivityPlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        interfaceManager: !!this.interfaceManager,
        commManager: !!this.commManager
      });
      return;
    }

    this.hoverHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    this.setUpTooltipElement();
    this.setUpHoverAction();

    this.dataSourceEnl = this.layerManager.getOrCreateSourceAndFilter("Player Activity Enl");
    this.dataSourceRes = this.layerManager.getOrCreateSourceAndFilter("Player Activity Res");
    this.setUpDataSource(this.dataSourceEnl);
    this.setUpDataSource(this.dataSourceRes);

    this.onReceiveCommMsgCallback = () => this.updatePlayerActivity();
    this.commManager.setOnReceiveMsgCallback(this.onReceiveCommMsgCallback);
    this.updatePlayerActivity();
  }

  public deinit() {
    this.commManager?.unsetOnReceiveMsgCallback(this.onReceiveCommMsgCallback);
    this.layerManager?.removeSourceAndFilter("Player Activity Enl");
    this.layerManager?.removeSourceAndFilter("Player Activity Res");
    this.playerLocations.clear();
    this.playerPaths.clear();
    this.unsetHoverAction();
    this.unsetTooltipElement();
  }

  private setUpTooltipElement() {
    const container = this.interfaceManager?.getContainer();
    if (!container) return;

    this.tooltipEl = (
      <div id="cesium-rich-tooltip" style={{
        display: "none",
        position: "absolute",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        padding: "4px",
        color: "white",
      }}>
      </div>
    ) as HTMLElement;

    container.appendChild(this.tooltipEl);
  }

  private unsetTooltipElement() {
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  private setUpHoverAction() {
    this.hoverAction = (movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const pickedObject = this.viewer?.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id as Cesium.Entity | Cesium.Entity[];
        if (Array.isArray(entity) && entity[0].id.startsWith("player-activity")) {
          // Multiplayer activities
          const allPlayersLastActivities: PlayerActivity[] = entity.map(e => {
            const specificPlayerActivities: PlayerActivity[] = e.properties?.activities.getValue();
            const activity: PlayerActivity = specificPlayerActivities[0];
            return {
              name: activity.name,
              team: activity.team,
              timestamp: activity.timestamp,
              weight: activity.weight,
              portalName: activity.portalName,
              lat: activity.lat,
              lng: activity.lng,
            };
          });
          allPlayersLastActivities.sort((a, b) => b.timestamp - a.timestamp);
          const table = (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{entity.length + " players"}</th>
                </tr>
              </thead>
              {allPlayersLastActivities.map(activity => {
                return (
                  <tr style={{ fontSize: "12px" }}>
                    <td style={{ paddingRight: "8px" }}>{activity.name}</td>
                    <td style={{ textAlign: "right" }}>{this.calcTimeAgoStr(activity.timestamp)}</td>
                  </tr>
                ) as HTMLElement;
              })}
            </table>
          ) as HTMLElement;
          this.styleTooltipElement(table, allPlayersLastActivities, movement);
        } else if (!Array.isArray(entity) && entity.id.startsWith("player-activity")) {
          // Single player activities
          const activities: PlayerActivity[] = entity.properties?.activities.getValue();
          activities.sort((a, b) => b.timestamp - a.timestamp);
          const table = (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{activities[0].name}</th>
                </tr>
              </thead>
              <tbody>
                {activities.slice(0, 6).map(activity => {
                  return (
                    <tr style={{ fontSize: "12px" }}>
                      <td style={{ paddingRight: "8px" }}>{activity.portalName}</td>
                      <td style={{ textAlign: "right" }}>{this.calcTimeAgoStr(activity.timestamp)}</td>
                    </tr>
                  ) as HTMLElement;
                })}
              </tbody>
            </table>
          ) as HTMLElement;
          if (!this.tooltipEl) return;
          this.styleTooltipElement(table, activities, movement);
        } else {
          // Hover out
          if (!this.tooltipEl) return;
          this.tooltipEl.innerHTML = "";
          this.tooltipEl.style.display = "none";
        }
      } else {
        // Hover out
        if (!this.tooltipEl) return;
        this.tooltipEl.innerHTML = "";
        this.tooltipEl.style.display = "none";
      }
    };
    this.hoverHandler?.setInputAction(this.hoverAction, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  private unsetHoverAction() {
    this.hoverHandler?.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.hoverHandler?.destroy();
    this.hoverHandler = undefined;
  }

  private setUpDataSource(source: Cesium.DataSource) {
    source.clustering.enabled = true;
    source.clustering.pixelRange = 20;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterLabels = true;
    source.clustering.clusterBillboards = true;
    source.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      const maxPlayers = 3;
      const playerActivities: PlayerActivity[] = clusteredEntities.map(e => {
        const specificPlayerActivities: PlayerActivity[] = e.properties?.activities.getValue();
        const lastActivity: PlayerActivity = specificPlayerActivities[specificPlayerActivities.length - 1];
        return {
          name: lastActivity.name,
          team: lastActivity.team,
          timestamp: lastActivity.timestamp,
          weight: lastActivity.weight,
          portalName: lastActivity.portalName,
          lat: lastActivity.lat,
          lng: lastActivity.lng,
        };
      });

      const displayText = playerActivities.slice(0, maxPlayers).map(p => p.name).join("\n")
        + (playerActivities.length > maxPlayers ? `\n(${playerActivities.length - maxPlayers} more)` : "");
      cluster.point.id = playerActivities;  // Point ids are not shown but used for tooltip
      cluster.label.show = true;
      cluster.label.text = displayText;
      cluster.label.font = "16px coda_regular, arial, helvetica, sans-serif";
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.label.horizontalOrigin = playerActivities[0].team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT;
      cluster.label.pixelOffset = playerActivities[0].team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0);
      cluster.label.eyeOffset = new Cesium.Cartesian3(0, 0, -3);
      cluster.label.fillColor = getTeamColor(playerActivities[0].team);
      cluster.label.outlineColor = Cesium.Color.BLACK;
      cluster.label.outlineWidth = 6;
      cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      cluster.billboard.show = true;
      cluster.billboard.image = this.buildCanvas()?.toDataURL() || "";
      cluster.billboard.eyeOffset = new Cesium.Cartesian3(0, 0, -2);
    });
  }

  private updatePlayerActivity(): void {
    const playerActivities: Map<string, PlayerActivity[]> = new Map();

    this.commManager?.getMessages("all")?.forEach((msg) => {
      let player: Player | null = null;
      let portal: Portal | null = null;

      for (let i = 0; i < msg.markup.length; i++) {
        const markup = msg.markup[i] as PlextMark;
        if (markup[0] === "PLAYER") {
          const name = markup[1].plain;
          const team = markup[1].team as Team;
          player = { name, team };
        } else if (markup[0] === "PORTAL") {
          const name = markup[1].name || null;
          const latE6 = markup[1].latE6 || null;
          const lngE6 = markup[1].lngE6 || null;
          if (!name || !latE6 || !lngE6) continue;
          portal = { name, latE6, lngE6 };
          break;  // Only take first portal found in message
        }
      }
      
      if (player && portal) {
        const activity = {
          name: player.name,
          team: player.team,
          timestamp: msg.timestamp,
          weight: 1,
          portalName: portal.name,
          lat: portal.latE6 / 1e6,
          lng: portal.lngE6 / 1e6,
        };

        const activities = playerActivities.get(player.name) || [];
        if (activities.length === 0) playerActivities.set(player.name, activities);

        const existing = activities.find(a => a.timestamp === activity.timestamp);
        const existingIndex = activities.findIndex((a) => a.timestamp === existing?.timestamp);

        if (existing) {
          // Calculate the average location and replace the found activity
          activities[existingIndex] = {
            name: existing.name,
            team: existing.team,
            timestamp: existing.timestamp,
            weight: existing.weight + 1,
            portalName: existing.portalName,
            lat: (existing.lat * existing.weight + activity.lat) / (existing.weight + 1),
            lng: (existing.lng * existing.weight + activity.lng) / (existing.weight + 1),
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
          id: `player-activity-${playerName}`,
          position: lastPosition,
          label: {
            text: playerName,
            font: "16px coda_regular, arial, helvetica, sans-serif",
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: lastActivity.team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
            pixelOffset: lastActivity.team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0),
            eyeOffset: new Cesium.Cartesian3(0, 0, -2),
            fillColor: getTeamColor(lastActivity.team),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 6,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
          billboard: {
            image: this.buildCanvas(),
            eyeOffset: new Cesium.Cartesian3(0, 0, -2),
          },
          properties: {
            activities: activities as PlayerActivity[]
          },
        });
      } else {
        entity.position = new Cesium.ConstantPositionProperty(lastPosition);

        // For rare ocations where agents might change their faction
        if (entity.label) {
          entity.label.horizontalOrigin = lastActivity.team === "ENLIGHTENED" ?
            new Cesium.ConstantProperty(Cesium.HorizontalOrigin.LEFT) :
            new Cesium.ConstantProperty(Cesium.HorizontalOrigin.RIGHT);
          entity.label.pixelOffset = lastActivity.team === "ENLIGHTENED" ?
            new Cesium.ConstantProperty(new Cesium.Cartesian2(25, 0)) :
            new Cesium.ConstantProperty(new Cesium.Cartesian2(-25, 0));
          entity.label.fillColor = new Cesium.ConstantProperty(getTeamColor(lastActivity.team));
        }

        // Update the properties for tooltips
        if (entity.properties) {
          entity.properties?.activities.setValue(activities as PlayerActivity[]);
        }
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

  private buildCanvas(): HTMLCanvasElement | undefined {
    const CANVAS_PX = 40;     // billboard size in screen pixels
    const PADDING = 4;        // padding around the focus square
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

    return canvas;
  }

  private calcTimeAgoStr(time: number) {
    const timeDiff = (Date.now() - time) / 1000;
    const hours = Math.floor(timeDiff / 60 / 60);
    const minutes = Math.floor(timeDiff / 60 % 60);
    const hourStr = hours === 0 ? "" : hours === 1 ? "1 hr" : hours > 1 ? hours + (" hrs") : "";
    const minutesStr = minutes === 0 ? "0 min" : minutes === 1 ? "1 min" : minutes > 1 ? minutes + (" mins") : "";
    return `${hourStr} ${minutesStr} ago`;
  }

  private styleTooltipElement(table: HTMLElement, activities: PlayerActivity[], movement: Cesium.ScreenSpaceEventHandler.MotionEvent ): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = "";
    this.tooltipEl.appendChild(table);
    this.tooltipEl.style.display = "block";
    this.tooltipEl.style.borderColor = getTeamColor(activities[0].team).toCssColorString();
    const container = this.interfaceManager?.getContainer();
    if (container && container.clientWidth - movement.endPosition.x < 200) {
      this.tooltipEl.style.left = "";
      this.tooltipEl.style.right = (container.clientWidth - movement.endPosition.x + 15) + "px";
    } else {
      this.tooltipEl.style.right = "";
      this.tooltipEl.style.left = (movement.endPosition.x + 15) + "px";
    }
    if (container && container.clientHeight - movement.endPosition.y < 200) {
      this.tooltipEl.style.top = "";
      this.tooltipEl.style.bottom = (container.clientHeight - movement.endPosition.y + 15) + "px";
    } else {
      this.tooltipEl.style.bottom = "";
      this.tooltipEl.style.top = (movement.endPosition.y + 15) + "px";
    }
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
