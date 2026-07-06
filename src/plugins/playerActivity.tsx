/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import type { EntityPosition, EntityPositionCallback } from "../managers/entity/entityPositionManager";
import type { IITCCore } from "../types/iitc/iitc.ts";
import type { Team } from "../types/common/common.ts";
import type { PlextMark } from "../types/api/getPlexts.ts";
import { getTeamColor } from "../utils/color";
import { h } from "../utils/dom.ts";
import { safeWindow } from "../utils/window";

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

interface PlayerActivityData {
  name: string;
  team: Team;
  timestamp: number;
  weight: number;
  portalName: string;
  latE6: number;
  lngE6: number;
}

interface PlayerActivity {
  data: PlayerActivityData;
  positionCallback: EntityPositionCallback;
}

interface PlayerActivityTooltip {
  title: string;
  activities: PlayerActivityData[];
  rowLabel: "name" | "portalName";
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
  private playerActivities: Map<string, PlayerActivity> = new Map();
  private playerLocations: Map<string, Cesium.Entity> = new Map();
  private playerLocationsPendingCreation: Set<string> = new Set();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private playerPathsPendingCreation: Set<string> = new Set();
  private onReceiveCommMsgCallback: () => void = () => {};

  private tooltipEl: HTMLElement | null = null;
  private hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  private readonly hoverAction: Cesium.ScreenSpaceEventHandler.MotionEventCallback = (movement) => this.handleHoverMove(movement);
  private readonly cameraMoveStartAction = () => this.handleCameraMoveStart();
  private readonly cameraMoveEndAction = () => this.handleCameraMoveEnd();
  private isCameraMoving = false;

  public init() {
    const iitc = safeWindow.iitc;
    this.viewer = iitc.viewer!;
    this.logManager = iitc.logManager!;
    this.layerManager = iitc.layerManager!;
    this.interfaceManager = iitc.interfaceManager!;
    this.commManager = iitc.commManager!;
    this.entityPositionManager = iitc.entityPositionManager!;

    if (!this.viewer || !this.layerManager || !this.interfaceManager || !this.logManager || !this.commManager || !this.entityPositionManager) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        interfaceManager: !!this.interfaceManager,
        commManager: !!this.commManager,
        entityPositionManager: !!this.entityPositionManager,
      });
      return;
    }

    try {
      this.hoverHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      this.setUpTooltipElement();
      this.setUpHoverAction();
      this.dataSourceEnl = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_ENL_LAYER_NAME);
      this.dataSourceRes = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_RES_LAYER_NAME);
      this.pathDataSourceEnl = this.layerManager.getOrCreateDataSource(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.pathDataSourceRes = this.layerManager.getOrCreateDataSource(ACTIVITY_PATH_RES_LAYER_NAME);
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
      this.layerManager.removeDataSourceLayer(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.layerManager.removeDataSourceLayer(ACTIVITY_PATH_RES_LAYER_NAME);
      this.playerLocations.clear();
      this.playerPaths.clear();
      this.playerLocationsPendingCreation.clear();
      this.playerPathsPendingCreation.clear();
      this.playerActivities.clear();
      this.unsetHoverAction();
      this.unsetTooltipElement();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize player activity plugin", e);
    }
  }

  private setUpTooltipElement() {
    const container = this.interfaceManager.getContainer();
    this.tooltipEl = PlayerActivityTooltipElement();
    container.appendChild(this.tooltipEl);
  }

  private unsetTooltipElement() {
    this.tooltipEl?.remove();
    this.tooltipEl = null;
  }

  private setUpHoverAction() {
    this.hoverHandler?.setInputAction(this.hoverAction, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.viewer.camera.moveStart.addEventListener(this.cameraMoveStartAction);
    this.viewer.camera.moveEnd.addEventListener(this.cameraMoveEndAction);
  }

  private unsetHoverAction() {
    this.viewer.camera.moveStart.removeEventListener(this.cameraMoveStartAction);
    this.viewer.camera.moveEnd.removeEventListener(this.cameraMoveEndAction);
    this.hoverHandler?.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.hoverHandler?.destroy();
    this.hoverHandler = undefined;
    this.isCameraMoving = false;
  }

  private handleCameraMoveStart(): void {
    this.isCameraMoving = true;
    this.hideTooltip();
  }

  private handleCameraMoveEnd(): void {
    this.isCameraMoving = false;
  }

  private handleHoverMove(movement: Cesium.ScreenSpaceEventHandler.MotionEvent): void {
    if (this.isCameraMoving) {
      this.hideTooltip();
      return;
    }

    const tooltip = this.getPickedPlayerActivityTooltip(movement.endPosition);
    if (!tooltip) {
      this.hideTooltip();
      return;
    }

    this.showTooltip(
      PlayerActivityTooltipTable({ tooltip }),
      tooltip.activities,
      movement,
    );
  }

  private getPickedPlayerActivityTooltip(position: Cesium.Cartesian2): PlayerActivityTooltip | undefined {
    const pickedObject = this.viewer.scene.pick(position) as { id?: Cesium.Entity | Cesium.Entity[] } | undefined;
    const entity = pickedObject?.id;

    if (Array.isArray(entity)) return this.getClusteredPlayerActivityTooltip(entity);
    if (entity) return this.getSinglePlayerActivityTooltip(entity);

    return undefined;
  }

  private getClusteredPlayerActivityTooltip(entities: Cesium.Entity[]): PlayerActivityTooltip | undefined {
    if (!this.isPlayerActivityEntity(entities[0])) return undefined;

    const activities = entities
      .map((entity) => this.getLatestActivity(this.getPlayerActivityEntityActivities(entity)))
      .filter((activity): activity is PlayerActivityData => !!activity)
      .sort(comparePlayerActivityTimestampDescending);
    if (activities.length === 0) return undefined;

    return {
      title: `${entities.length} players`,
      activities,
      rowLabel: "name",
    };
  }

  private getSinglePlayerActivityTooltip(entity: Cesium.Entity): PlayerActivityTooltip | undefined {
    if (!this.isPlayerActivityEntity(entity)) return undefined;

    const activities = [...this.getPlayerActivityEntityActivities(entity)]
      .sort(comparePlayerActivityTimestampDescending);
    const latestActivity = activities[0];
    if (!latestActivity) return undefined;

    return {
      title: latestActivity.name,
      activities: activities.slice(0, 6),
      rowLabel: "portalName",
    };
  }

  private isPlayerActivityEntity(entity: Cesium.Entity | undefined): entity is Cesium.Entity {
    return typeof entity?.id === "string" && entity.id.startsWith("player-activity");
  }

  private getPlayerActivityEntityActivities(entity: Cesium.Entity): PlayerActivityData[] {
    return entity.properties?.activities?.getValue() ?? [];
  }

  private configureDataSource(source: Cesium.DataSource) {
    source.clustering.enabled = true;
    source.clustering.pixelRange = 20;
    source.clustering.minimumClusterSize = 2;
    source.clustering.clusterLabels = true;
    source.clustering.clusterBillboards = true;
    source.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      const maxPlayers = 2;
      const playerActivitiesData: PlayerActivityData[] = clusteredEntities.map(e => {
        const specificPlayerActivitiesData: PlayerActivityData[] = e.properties?.activities.getValue();
        const lastActivity = this.getLatestActivity(specificPlayerActivitiesData);
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
      }).filter((activityData): activityData is PlayerActivityData => !!activityData);
      if (playerActivitiesData.length === 0) return;
      playerActivitiesData.sort((a, b) => b.timestamp - a.timestamp);

      const visiblePlayerNames = playerActivitiesData.slice(0, maxPlayers).map(p => p.name).join("\n");
      const remainingPlayers = playerActivitiesData.length - maxPlayers;
      const displayText = remainingPlayers === 1
        ? `${visiblePlayerNames}\n${playerActivitiesData[maxPlayers].name}`
        : remainingPlayers > 1
          ? `${visiblePlayerNames}\n(${remainingPlayers} more)`
          : visiblePlayerNames;
      cluster.label.show = true;
      cluster.label.text = displayText;
      cluster.label.font = "16px coda_regular, arial, helvetica, sans-serif";
      cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      cluster.label.horizontalOrigin = playerActivitiesData[0].team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT;
      cluster.label.pixelOffset = playerActivitiesData[0].team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0);
      cluster.label.fillColor = getTeamColor(playerActivitiesData[0].team);
      cluster.label.outlineColor = Cesium.Color.BLACK;
      cluster.label.outlineWidth = 6;
      cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
      cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
      cluster.billboard.show = true;
      cluster.billboard.image = buildCanvas().toDataURL();
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
  }

  private showTooltip(table: HTMLElement, activitiesData: PlayerActivityData[], movement: Cesium.ScreenSpaceEventHandler.MotionEvent): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = "";
    this.tooltipEl.appendChild(table);
    this.tooltipEl.style.display = "block";
    this.tooltipEl.style.borderColor = getTeamColor(activitiesData[0].team).toCssColorString();
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

  private hideTooltip(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = "";
    this.tooltipEl.style.display = "none";
  }

  private updatePlayerActivity(): void {
    const playerActivitiesData: Map<string, PlayerActivityData[]> = new Map();

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

        const activities = playerActivitiesData.get(player.name) || [];
        if (activities.length === 0) playerActivitiesData.set(player.name, activities);

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
        playerActivitiesData.set(player.name, activities);
      }
    });

    this.renderPlayerLocations(playerActivitiesData);
    this.renderPlayerPaths(playerActivitiesData);
    this.viewer.scene.requestRender();
  }

  private getLatestActivity(activitiesData: PlayerActivityData[] | undefined): PlayerActivityData | undefined {
    return activitiesData?.reduce<PlayerActivityData | undefined>((latest, activity) => {
      if (!latest || activity.timestamp > latest.timestamp) return activity;
      return latest;
    }, undefined);
  }

  private setPlayerPositionSubscription(activityData: PlayerActivityData, entity: Cesium.Entity): void {
    const existing = this.playerActivities.get(activityData.name);
    if (existing?.data.latE6 === activityData.latE6 && existing?.data.lngE6 === activityData.lngE6) return;
    if (existing) this.entityPositionManager.unsetOnPositionChangedCallback(existing.data, existing.positionCallback);

    const callback: EntityPositionCallback = (entityPosition) => {
      entity.position = new Cesium.ConstantPositionProperty(entityPosition.position);
      entity.show = !entityPosition.isFallbackPosition;
      this.viewer.scene.requestRender();
    };
    this.entityPositionManager.setOnPositionChangedCallback(activityData, callback);
    this.playerActivities.set(activityData.name, {
      data: activityData,
      positionCallback: callback,
    });
  }

  private unsetPlayerPositionSubscriptions(): void {
    this.playerActivities.forEach(({ data, positionCallback }) => {
      this.entityPositionManager.unsetOnPositionChangedCallback(data, positionCallback);
    });
  }

  private renderPlayerLocations(playerActivitiesData: Map<string, PlayerActivityData[]>): void {
    playerActivitiesData.forEach((activities, playerName) => {
      const lastActivity = this.getLatestActivity(activities);
      if (!lastActivity) return;
      this.renderPlayerLocation(playerName, activities, lastActivity).then();
    });
  }

  private async renderPlayerLocation(playerName: string, activitiesData: PlayerActivityData[], lastActivity: PlayerActivityData): Promise<void> {
    if (this.playerLocationsPendingCreation.has(playerName)) return;
    this.playerLocationsPendingCreation.add(playerName);

    try {
      const lastEntityPosition = await this.entityPositionManager.getEntityPosition(lastActivity);
      if (!this.playerLocationsPendingCreation.has(playerName)) return;

      let source: Cesium.DataSource;
      if (lastActivity.team === "ENLIGHTENED") source = this.dataSourceEnl;
      else if (lastActivity.team === "RESISTANCE") source = this.dataSourceRes;
      else return;

      let entity = this.playerLocations.get(playerName);
      if (!entity) entity = this.createPlayerLocationEntity(source, lastEntityPosition, lastActivity, activitiesData, playerName);
      else this.updatePlayerLocationEntity(entity, lastEntityPosition, lastActivity, activitiesData);

      this.setPlayerPositionSubscription(lastActivity, entity);
      this.playerLocations.set(playerName, entity);
    } finally {
      this.playerLocationsPendingCreation.delete(playerName);
    }
  }

  private createPlayerLocationEntity(
    source: Cesium.DataSource,
    lastEntityPosition: EntityPosition,
    lastActivityData: PlayerActivityData,
    activitiesData: PlayerActivityData[],
    playerName: string,
  ): Cesium.Entity {
    return source.entities.add({
      id: `player-activity-${playerName}`,
      position: lastEntityPosition.position,
      show: !lastEntityPosition.isFallbackPosition,
      label: {
        text: playerName,
        font: "16px coda_regular, arial, helvetica, sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: lastActivityData.team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
        pixelOffset: lastActivityData.team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0),
        fillColor: getTeamColor(lastActivityData.team),
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
        activities: activitiesData as PlayerActivityData[]
      },
    });
  }

  private updatePlayerLocationEntity(
    entity: Cesium.Entity,
    lastEntityPosition: EntityPosition,
    lastActivityData: PlayerActivityData,
    activitiesData: PlayerActivityData[],
  ): void {
    entity.position = new Cesium.ConstantPositionProperty(lastEntityPosition.position);
    entity.show = !lastEntityPosition.isFallbackPosition;

    // For rare ocations where agents might change their faction
    if (entity.label) {
      entity.label.horizontalOrigin = lastActivityData.team === "ENLIGHTENED" ?
        new Cesium.ConstantProperty(Cesium.HorizontalOrigin.LEFT) :
        new Cesium.ConstantProperty(Cesium.HorizontalOrigin.RIGHT);
      entity.label.pixelOffset = lastActivityData.team === "ENLIGHTENED" ?
        new Cesium.ConstantProperty(new Cesium.Cartesian2(25, 0)) :
        new Cesium.ConstantProperty(new Cesium.Cartesian2(-25, 0));
      entity.label.fillColor = new Cesium.ConstantProperty(getTeamColor(lastActivityData.team));
    }

    // Update the properties for tooltips
    if (entity.properties) {
      entity.properties?.activities.setValue(activitiesData as PlayerActivityData[]);
    }
  }

  private renderPlayerPaths(playerActivitiesData: Map<string, PlayerActivityData[]>): void {
    playerActivitiesData.forEach((activities, playerName) => {
      const lastActivity = this.getLatestActivity(activities);
      if (!lastActivity) return;
      this.renderPlayerPath(playerName, activities, lastActivity).then();
    });
  }

  private async renderPlayerPath(playerName: string, activities: PlayerActivityData[], lastActivity: PlayerActivityData): Promise<void> {
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

const PlayerActivityTooltipElement = (): HTMLElement => {
  return (
    <div id="cesium-rich-tooltip" style={{
      display: "none",
      position: "absolute",
      backgroundColor: "rgba(42, 42, 42, 0.9)",
      border: "1px solid #555",
      padding: "4px",
      color: "white",
      zIndex: "10500",
    }} />
  ) as HTMLElement;
};

const PlayerActivityTooltipTable = ({tooltip}: {
  tooltip: PlayerActivityTooltip;
}): HTMLElement => {
  return (
    <table>
      <thead>
      <tr>
        <th style={{ textAlign: "left" }}>{tooltip.title}</th>
      </tr>
      </thead>
      <tbody>
      {tooltip.activities.map(activity => {
        return (
          <tr style={{ fontSize: "12px" }}>
            <td style={{ paddingRight: "8px" }}>{activity[tooltip.rowLabel]}</td>
            <td style={{ textAlign: "right" }}>{calcTimeAgoStr(activity.timestamp)}</td>
          </tr>
        ) as HTMLElement;
      })}
      </tbody>
    </table>
  ) as HTMLElement;
};

function comparePlayerActivityTimestampDescending(a: PlayerActivityData, b: PlayerActivityData): number {
  return b.timestamp - a.timestamp;
}

function calcTimeAgoStr(time: number) {
  const timeDiff = (Date.now() - time) / 1000;
  const hours = Math.floor(timeDiff / 60 / 60);
  const minutes = Math.floor(timeDiff / 60 % 60);
  const hourStr = hours === 0 ? "" : hours === 1 ? "1 hr" : hours > 1 ? hours + (" hrs") : "";
  const minutesStr = minutes === 0 ? "0 min" : minutes === 1 ? "1 min" : minutes > 1 ? minutes + (" mins") : "";
  return `${hourStr} ${minutesStr} ago`;
}

function buildCanvas(): HTMLCanvasElement {
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
  if (!ctx) return canvas;

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
    window.setTimeout(register, 1000);
  }
};

register();
