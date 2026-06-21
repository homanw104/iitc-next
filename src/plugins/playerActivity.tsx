/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import { h } from "../utils/dom.ts";
import { safeWindow } from "../utils/window";
import { getTeamColor } from "../utils/color";
import type { Team } from "../types/ingress";
import type { IITCCore } from "../types/iitc";
import type { PlextMark } from "../managers/commManager";
import type { EntityCoordinates, EntityPositionCallback } from "../managers/entityPositionManager";

const LOG_TAG = "PlayerActivityPlugin";
const PLAYER_ACTIVITY_ENL_LAYER_NAME = "Player Activity Enl";
const PLAYER_ACTIVITY_RES_LAYER_NAME = "Player Activity Res";
const ACTIVITY_PATH_ENL_LAYER_NAME = "Activity Path Enl";
const ACTIVITY_PATH_RES_LAYER_NAME = "Activity Path Res";
const ACTIVITY_PATH_LINE_COLOR = "#E130DE";
const ACTIVITY_PATH_LINE_ALPHA = 0.9;

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
  latE6: number;
  lngE6: number;
}

interface PlayerPositionSubscription {
  coordinates: EntityCoordinates;
  callback: EntityPositionCallback;
}

class PlayerActivityPlugin {
  public id = "player-activity-tracker";
  public name = "Player Activity Tracker";
  public description = "Adds two layers to the map for players and their activity.";

  private viewer!: NonNullable<IITCCore["viewer"]>;
  private logManager!: NonNullable<IITCCore["logManager"]>;
  private layerManager!: NonNullable<IITCCore["layerManager"]>;
  private interfaceManager!: NonNullable<IITCCore["interfaceManager"]>;
  private commManager!: NonNullable<IITCCore["commManager"]>;
  private entityPositionManager!: NonNullable<IITCCore["entityPositionManager"]>;

  private dataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-enl");
  private dataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity-res");
  private pathDataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("activity-path-enl");
  private pathDataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("activity-path-res");
  private playerLocations: Map<string, Cesium.Entity> = new Map();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private playerLocationsPendingCreation: Set<string> = new Set();
  private playerPathsPendingCreation: Set<string> = new Set();
  private playerPositionSubscriptions: Map<string, PlayerPositionSubscription> = new Map();
  private onReceiveCommMsgCallback: () => void = () => {};

  private tooltipEl: HTMLElement | null = null;
  private hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  private hoverAction: Cesium.ScreenSpaceEventHandler.MotionEventCallback = () => {};

  public init() {
    const { viewer, logManager, layerManager, interfaceManager, commManager, entityPositionManager } = safeWindow.iitc;

    if (!viewer || !layerManager || !interfaceManager || !logManager || !commManager || !entityPositionManager) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        viewer: !!viewer,
        logManager: !!logManager,
        layerManager: !!layerManager,
        interfaceManager: !!interfaceManager,
        commManager: !!commManager,
        entityPositionManager: !!entityPositionManager,
      });
      return;
    }

    this.viewer = viewer;
    this.logManager = logManager;
    this.layerManager = layerManager;
    this.interfaceManager = interfaceManager;
    this.commManager = commManager;
    this.entityPositionManager = entityPositionManager;

    try {
      this.hoverHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      this.setUpTooltipElement();
      this.setUpHoverAction();
      this.dataSourceEnl = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_ENL_LAYER_NAME);
      this.dataSourceRes = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_RES_LAYER_NAME);
      this.pathDataSourceEnl = this.layerManager.getOrCreatePluginDataSourceLayer(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.pathDataSourceRes = this.layerManager.getOrCreatePluginDataSourceLayer(ACTIVITY_PATH_RES_LAYER_NAME);
      this.configureDataSource(this.dataSourceEnl);
      this.configureDataSource(this.dataSourceRes);
      this.onReceiveCommMsgCallback = () => this.updatePlayerActivity();
      this.commManager.setOnReceiveMsgCallback(this.onReceiveCommMsgCallback);
      this.updatePlayerActivity();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize player activity plugin", e);
      throw e;
    }
  }

  public deinit() {
    try {
      this.unsetPlayerPositionSubscriptions();
      this.commManager.unsetOnReceiveMsgCallback(this.onReceiveCommMsgCallback);
      this.layerManager.removeOverlayLayer(PLAYER_ACTIVITY_ENL_LAYER_NAME);
      this.layerManager.removeOverlayLayer(PLAYER_ACTIVITY_RES_LAYER_NAME);
      this.layerManager.removePluginDataSourceLayer(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.layerManager.removePluginDataSourceLayer(ACTIVITY_PATH_RES_LAYER_NAME);
      this.playerLocations.clear();
      this.playerPaths.clear();
      this.playerLocationsPendingCreation.clear();
      this.playerPathsPendingCreation.clear();
      this.playerPositionSubscriptions.clear();
      this.unsetHoverAction();
      this.unsetTooltipElement();
    } catch (e) {
      this.logManager.error(LOG_TAG, e);
    }
  }

  private setUpTooltipElement() {
    const container = this.interfaceManager.getContainer();

    this.tooltipEl = (
      <div id="cesium-rich-tooltip" style={{
        display: "none",
        position: "absolute",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        padding: "4px",
        color: "white",
      }} />
    ) as HTMLElement;

    container.appendChild(this.tooltipEl);
  }

  private unsetTooltipElement() {
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  private setUpHoverAction() {
    this.hoverAction = (movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const pickedObject = this.viewer.scene.pick(movement.endPosition);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id as Cesium.Entity | Cesium.Entity[];
        if (Array.isArray(entity) && entity[0].id.startsWith("player-activity")) {
          // Multiplayer activities
          const allPlayersLastActivities: PlayerActivity[] = entity.map(e => {
            const specificPlayerActivities: PlayerActivity[] = e.properties?.activities.getValue();
            const activity = this.getLatestActivity(specificPlayerActivities);
            if (!activity) return null;
            return {
              name: activity.name,
              team: activity.team,
              timestamp: activity.timestamp,
              weight: activity.weight,
              portalName: activity.portalName,
              latE6: activity.latE6,
              lngE6: activity.lngE6,
            };
          }).filter((activity): activity is PlayerActivity => !!activity);
          if (allPlayersLastActivities.length === 0) return;
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
                    <td style={{ textAlign: "right" }}>{calcTimeAgoStr(activity.timestamp)}</td>
                  </tr>
                ) as HTMLElement;
              })}
            </table>
          ) as HTMLElement;
          this.configureTooltipElement(table, allPlayersLastActivities, movement);
        } else if (!Array.isArray(entity) && entity.id.startsWith("player-activity")) {
          // Single player activities
          const activities: PlayerActivity[] = entity.properties?.activities.getValue();
          const newestActivities = [...activities].sort((a, b) => b.timestamp - a.timestamp);
          const latestActivity = newestActivities[0];
          if (!latestActivity) return;
          const table = (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{latestActivity.name}</th>
                </tr>
              </thead>
              <tbody>
                {newestActivities.slice(0, 6).map(activity => {
                  return (
                    <tr style={{ fontSize: "12px" }}>
                      <td style={{ paddingRight: "8px" }}>{activity.portalName}</td>
                      <td style={{ textAlign: "right" }}>{calcTimeAgoStr(activity.timestamp)}</td>
                    </tr>
                  ) as HTMLElement;
                })}
              </tbody>
            </table>
          ) as HTMLElement;
          if (!this.tooltipEl) return;
          this.configureTooltipElement(table, newestActivities, movement);
        } else {
          // Hover out
          if (!this.tooltipEl) return;
          this.tooltipEl.innerHTML = "";
          this.tooltipEl.style.display = "none";
        }
      } else {
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

  private configureDataSource(source: Cesium.DataSource) {
    source.clustering.enabled = true;
    source.clustering.pixelRange = 20;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterLabels = true;
    source.clustering.clusterBillboards = true;
    source.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      const maxPlayers = 2;
      const playerActivities: PlayerActivity[] = clusteredEntities.map(e => {
        const specificPlayerActivities: PlayerActivity[] = e.properties?.activities.getValue();
        const lastActivity = this.getLatestActivity(specificPlayerActivities);
        if (!lastActivity) return null;
        return {
          name: lastActivity.name,
          team: lastActivity.team,
          timestamp: lastActivity.timestamp,
          weight: lastActivity.weight,
          portalName: lastActivity.portalName,
          latE6: lastActivity.latE6,
          lngE6: lastActivity.lngE6,
        };
      }).filter((activity): activity is PlayerActivity => !!activity);
      if (playerActivities.length === 0) return;
      playerActivities.sort((a, b) => b.timestamp - a.timestamp);

      const visiblePlayerNames = playerActivities.slice(0, maxPlayers).map(p => p.name).join("\n");
      const remainingPlayers = playerActivities.length - maxPlayers;
      const displayText = remainingPlayers === 1
        ? `${visiblePlayerNames}\n${playerActivities[maxPlayers].name}`
        : remainingPlayers > 1
          ? `${visiblePlayerNames}\n(${remainingPlayers} more)`
          : visiblePlayerNames;
      cluster.label.show = true;
      cluster.label.text = displayText;
      cluster.label.font = "16px coda_regular, arial, helvetica, sans-serif";
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.label.horizontalOrigin = playerActivities[0].team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT;
      cluster.label.pixelOffset = playerActivities[0].team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0);
      cluster.label.fillColor = getTeamColor(playerActivities[0].team);
      cluster.label.outlineColor = Cesium.Color.BLACK;
      cluster.label.outlineWidth = 6;
      cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      cluster.billboard.show = true;
      cluster.billboard.image = buildCanvas()?.toDataURL() || "";
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
  }

  private configureTooltipElement(table: HTMLElement, activities: PlayerActivity[], movement: Cesium.ScreenSpaceEventHandler.MotionEvent ): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = "";
    this.tooltipEl.appendChild(table);
    this.tooltipEl.style.display = "block";
    this.tooltipEl.style.borderColor = getTeamColor(activities[0].team).toCssColorString();
    const container = this.interfaceManager.getContainer();
    if (container && container.clientWidth - movement.endPosition.x - this.tooltipEl.clientWidth < 30) {
      this.tooltipEl.style.left = "";
      this.tooltipEl.style.right = "15px";
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

  private updatePlayerActivity(): void {
    const playerActivities: Map<string, PlayerActivity[]> = new Map();

    this.commManager.getMessages("all", false)?.forEach((msg) => {
      let player: Player | null = null;
      let portal: Portal | null = null;
      const timestamp = msg[1];
      const plext = msg[2].plext;

      // Omit link and field destruction as we cannot distinguish the destroyed end
      const msgPattern = /.*(Your Link|destroyed the).*/;
      if (msgPattern.test(plext.text)) return;

      for (let i = 0; i < plext.markup.length; i++) {
        const markup = plext.markup[i] as PlextMark;
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
          timestamp: timestamp,
          weight: 1,
          portalName: portal.name,
          latE6: portal.latE6,
          lngE6: portal.lngE6,
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
            latE6: Math.round((existing.latE6 * existing.weight + activity.latE6) / (existing.weight + 1)),
            lngE6: Math.round((existing.lngE6 * existing.weight + activity.lngE6) / (existing.weight + 1)),
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
    this.viewer.scene.requestRender();
  }

  private getLatestActivity(activities: PlayerActivity[] | undefined): PlayerActivity | undefined {
    return activities?.reduce<PlayerActivity | undefined>((latest, activity) => {
      if (!latest || activity.timestamp > latest.timestamp) return activity;
      return latest;
    }, undefined);
  }

  private setPlayerPositionSubscription(playerName: string, coordinates: EntityCoordinates, entity: Cesium.Entity): void {
    const existing = this.playerPositionSubscriptions.get(playerName);
    if (existing?.coordinates.latE6 === coordinates.latE6 && existing?.coordinates.lngE6 === coordinates.lngE6) return;
    if (existing) this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(existing.coordinates, existing.callback);

    const callback: EntityPositionCallback = (_latE6, _lngE6, position) => {
      entity.position = new Cesium.ConstantPositionProperty(position);
      this.viewer.scene.requestRender();
    };
    const subscriptionCoordinates = {
      latE6: coordinates.latE6,
      lngE6: coordinates.lngE6,
    };
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(subscriptionCoordinates, callback);
    this.playerPositionSubscriptions.set(playerName, {
      coordinates: subscriptionCoordinates,
      callback,
    });
  }

  private unsetPlayerPositionSubscriptions(): void {
    this.playerPositionSubscriptions.forEach(({ coordinates, callback }) => {
      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(coordinates, callback);
    });
  }

  private renderPlayerLocations(playerActivities: Map<string, PlayerActivity[]>): void {
    playerActivities.forEach((activities, playerName) => {
      const lastActivity = this.getLatestActivity(activities);
      if (!lastActivity) return;
      this.renderPlayerLocation(playerName, activities, lastActivity).then();
    });
  }

  private async renderPlayerLocation(playerName: string, activities: PlayerActivity[], lastActivity: PlayerActivity): Promise<void> {
    if (this.playerLocationsPendingCreation.has(playerName)) return;
    this.playerLocationsPendingCreation.add(playerName);

    try {
      const lastPosition = await this.entityPositionManager.getPosition(lastActivity);
      if (!this.playerLocationsPendingCreation.has(playerName)) return;

      let source: Cesium.DataSource;
      if (lastActivity.team === "ENLIGHTENED") source = this.dataSourceEnl;
      else if (lastActivity.team === "RESISTANCE") source = this.dataSourceRes;
      else return;

      let entity = this.playerLocations.get(playerName);
      if (!entity) entity = this.createPlayerLocationEntity(source, lastPosition, lastActivity, activities, playerName);
      else this.updatePlayerLocationEntity(entity, lastPosition, lastActivity, activities);

      this.setPlayerPositionSubscription(playerName, lastActivity, entity);
      this.playerLocations.set(playerName, entity);
    } finally {
      this.playerLocationsPendingCreation.delete(playerName);
    }
  }

  private createPlayerLocationEntity(
    source: Cesium.DataSource,
    lastPosition: Cesium.Cartesian3,
    lastActivity: PlayerActivity,
    activities: PlayerActivity[],
    playerName: string,
  ): Cesium.Entity {
    return source.entities.add({
      id: `player-activity-${playerName}`,
      position: lastPosition,
      label: {
        text: playerName,
        font: "16px coda_regular, arial, helvetica, sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: lastActivity.team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
        pixelOffset: lastActivity.team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0),
        fillColor: getTeamColor(lastActivity.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 6,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      billboard: {
        image: buildCanvas(),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        activities: activities as PlayerActivity[]
      },
    });
  }

  private updatePlayerLocationEntity(
    entity: Cesium.Entity,
    lastPosition: Cesium.Cartesian3,
    lastActivity: PlayerActivity,
    activities: PlayerActivity[],
  ): void {
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

  private renderPlayerPaths(playerActivities: Map<string, PlayerActivity[]>): void {
    playerActivities.forEach((activities, playerName) => {
      const lastActivity = this.getLatestActivity(activities);
      if (!lastActivity) return;
      this.renderPlayerPath(playerName, activities, lastActivity).then();
    });
  }

  private async renderPlayerPath(playerName: string, activities: PlayerActivity[], lastActivity: PlayerActivity): Promise<void> {
    if (this.playerPathsPendingCreation.has(playerName)) return;
    this.playerPathsPendingCreation.add(playerName);

    try {
      const pathActivities = activities.filter((activity, index) => {
        const previous = activities[index - 1];
        return !previous || previous.latE6 !== activity.latE6 || previous.lngE6 !== activity.lngE6;
      });
      if (pathActivities.length < 2) return;

      const coordinates: number[] = [];
      pathActivities.forEach(activity => coordinates.push(activity.lngE6 / 1e6, activity.latE6 / 1e6));
      const positions = Cesium.Cartesian3.fromDegreesArray(coordinates);

      let source: Cesium.DataSource;
      if (lastActivity.team === "ENLIGHTENED") source = this.pathDataSourceEnl;
      else if (lastActivity.team === "RESISTANCE") source = this.pathDataSourceRes;
      else return;

      let entity = this.playerPaths.get(playerName);
      if (!entity) entity = this.createPlayerPathEntity(source, positions);
      else this.updatePlayerPathEntity(entity, positions);

      this.playerPaths.set(playerName, entity);
      this.viewer.scene.requestRender();
    } finally {
      this.playerPathsPendingCreation.delete(playerName);
    }
  }

  private createPlayerPathEntity(source: Cesium.DataSource, positions: Cesium.Cartesian3[]): Cesium.Entity {
    return source.entities.add({
      polyline: {
        positions: positions,
        clampToGround: true,
        width: 3,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString(ACTIVITY_PATH_LINE_COLOR).withAlpha(ACTIVITY_PATH_LINE_ALPHA),
          dashLength: 12,
        }),
      }
    });
  }

  private updatePlayerPathEntity(entity: Cesium.Entity, positions: Cesium.Cartesian3[]): void {
    if (entity.polyline) {
      entity.polyline.positions = new Cesium.ConstantProperty(positions);
    }
  }
}

function calcTimeAgoStr(time: number) {
  const timeDiff = (Date.now() - time) / 1000;
  const hours = Math.floor(timeDiff / 60 / 60);
  const minutes = Math.floor(timeDiff / 60 % 60);
  const hourStr = hours === 0 ? "" : hours === 1 ? "1 hr" : hours > 1 ? hours + (" hrs") : "";
  const minutesStr = minutes === 0 ? "0 min" : minutes === 1 ? "1 min" : minutes > 1 ? minutes + (" mins") : "";
  return `${hourStr} ${minutesStr} ago`;
}

function buildCanvas(): HTMLCanvasElement | undefined {
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

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new PlayerActivityPlugin());
  } else {
    setTimeout(register, 1000);
  }
};

register();
