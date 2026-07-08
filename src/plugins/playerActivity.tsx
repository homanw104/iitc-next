/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations with Cesium primitives and movement paths with Cesium entities.
 */

import * as Cesium from "cesium";
import type { EntityPosition, EntityPositionCallback } from "../managers/entity/entityPositionManager";
import type { LayerOverlay } from "../managers/layer/layerOverlay";
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
const PLAYER_ACTIVITY_CLUSTER_PIXEL_RANGE = 20;
const PLAYER_ACTIVITY_CLUSTER_MINIMUM_SIZE = 2;
const PLAYER_ACTIVITY_CLUSTER_MAX_VISIBLE_PLAYERS = 2;
const PLAYER_ACTIVITY_LABEL_FONT = "16px coda_regular, arial, helvetica, sans-serif";
const PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH = 6;
const PLAYER_ACTIVITY_BILLBOARD_SIZE_PX = 40;
const PLAYER_ACTIVITY_LABEL_AVERAGE_CHARACTER_WIDTH_PX = 9;
const PLAYER_ACTIVITY_LABEL_HEIGHT_PX = 20;

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


interface PlayerLocation {
  id: PlayerLocationPrimitiveId;
  label: Cesium.Label;
  billboard: Cesium.Billboard;
  currentLayerName: string;
}

interface PlayerLocationCluster {
  id: PlayerLocationPrimitiveId[];
  label: Cesium.Label;
  billboard: Cesium.Billboard;
  currentLayerName: string;
}

interface PlayerLocationPrimitiveId {
  id: string;
  activities: PlayerActivityData[];
}

interface PlayerLocationClusterCandidate {
  location: PlayerLocation;
  windowPosition: Cesium.Cartesian2;
  bounds: PlayerLocationClusterBounds;
  clustered: boolean;
}

interface PlayerLocationClusterBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
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

  private overlayLayerEnl!: LayerOverlay;
  private overlayLayerRes!: LayerOverlay;
  private pathDataSourceEnl: Cesium.CustomDataSource = new Cesium.CustomDataSource("activity-path-enl");
  private pathDataSourceRes: Cesium.CustomDataSource = new Cesium.CustomDataSource("activity-path-res");
  private playerActivities: Map<string, PlayerActivity> = new Map();
  private playerLocations: Map<string, PlayerLocation> = new Map();
  private playerLocationClusters: PlayerLocationCluster[] = [];
  private playerLocationsPendingCreation: Set<string> = new Set();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private playerPathsPendingCreation: Set<string> = new Set();
  private playerLocationClustersDirty = true;
  private playerLocationBillboardImage: HTMLCanvasElement | undefined;
  private onReceiveCommMsgCallback: () => void = () => {};

  private tooltipEl: HTMLElement | null = null;
  private hoverHandler: Cesium.ScreenSpaceEventHandler | undefined;
  private readonly hoverAction: Cesium.ScreenSpaceEventHandler.MotionEventCallback = (movement) => this.handleHoverMove(movement);
  private readonly cameraMoveStartAction = () => this.handleCameraMoveStart();
  private readonly cameraMoveEndAction = () => this.handleCameraMoveEnd();
  private readonly cameraChangedAction = () => this.markPlayerLocationClustersDirty();
  private readonly playerLocationClusterPreRenderAction = () => this.refreshPlayerLocationClustersIfDirty();
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
      this.overlayLayerEnl = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_ENL_LAYER_NAME);
      this.overlayLayerRes = this.layerManager.getOrCreateOverlayLayer(PLAYER_ACTIVITY_RES_LAYER_NAME);
      this.pathDataSourceEnl = this.layerManager.getOrCreateDataSource(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.pathDataSourceRes = this.layerManager.getOrCreateDataSource(ACTIVITY_PATH_RES_LAYER_NAME);
      this.setUpPlayerLocationClustering();
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
      this.unsetPlayerLocationClustering();
      this.layerManager.removeOverlayLayer(PLAYER_ACTIVITY_ENL_LAYER_NAME);
      this.layerManager.removeOverlayLayer(PLAYER_ACTIVITY_RES_LAYER_NAME);
      this.layerManager.removeDataSourceLayer(ACTIVITY_PATH_ENL_LAYER_NAME);
      this.layerManager.removeDataSourceLayer(ACTIVITY_PATH_RES_LAYER_NAME);
      this.playerLocations.clear();
      this.playerPaths.clear();
      this.playerLocationsPendingCreation.clear();
      this.playerPathsPendingCreation.clear();
      this.playerActivities.clear();
      this.playerLocationBillboardImage = undefined;
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

  private setUpPlayerLocationClustering(): void {
    this.viewer.camera.changed.addEventListener(this.cameraChangedAction);
    this.viewer.scene.preRender.addEventListener(this.playerLocationClusterPreRenderAction);
    this.markPlayerLocationClustersDirty();
  }

  private unsetPlayerLocationClustering(): void {
    this.viewer.camera.changed.removeEventListener(this.cameraChangedAction);
    this.viewer.scene.preRender.removeEventListener(this.playerLocationClusterPreRenderAction);
    this.removePlayerLocationClusters();
    this.playerLocationClustersDirty = false;
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
    const pickedObject = this.viewer.scene.pick(position) as { id?: unknown } | undefined;
    const id = pickedObject?.id;

    if (Array.isArray(id)) return this.getClusteredPlayerActivityTooltip(id);
    if (this.isPlayerLocationPrimitiveId(id)) return this.getSinglePlayerActivityTooltip(id);

    return undefined;
  }

  private getClusteredPlayerActivityTooltip(ids: unknown[]): PlayerActivityTooltip | undefined {
    if (!this.isPlayerLocationPrimitiveId(ids[0])) return undefined;

    const activities = ids
      .filter((id): id is PlayerLocationPrimitiveId => this.isPlayerLocationPrimitiveId(id))
      .map((id) => this.getLatestActivity(id.activities))
      .filter((activity): activity is PlayerActivityData => !!activity)
      .sort(comparePlayerActivityTimestampDescending);
    if (activities.length === 0) return undefined;

    return {
      title: `${ids.length} players`,
      activities,
      rowLabel: "name",
    };
  }

  private getSinglePlayerActivityTooltip(id: PlayerLocationPrimitiveId): PlayerActivityTooltip | undefined {
    const activities = [...id.activities]
      .sort(comparePlayerActivityTimestampDescending);
    const latestActivity = activities[0];
    if (!latestActivity) return undefined;

    return {
      title: latestActivity.name,
      activities: activities.slice(0, 6),
      rowLabel: "portalName",
    };
  }

  private isPlayerLocationPrimitiveId(value: unknown): value is PlayerLocationPrimitiveId {
    if (typeof value !== "object" || value === null) return false;

    const id = value as Partial<PlayerLocationPrimitiveId>;
    return typeof id.id === "string" &&
      id.id.startsWith("player-activity") &&
      Array.isArray(id.activities);
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

  private setPlayerPositionSubscription(activityData: PlayerActivityData): void {
    const existing = this.playerActivities.get(activityData.name);
    if (existing?.data.latE6 === activityData.latE6 && existing?.data.lngE6 === activityData.lngE6) return;
    if (existing) this.entityPositionManager.unsetOnPositionChangedCallback(existing.data, existing.positionCallback);

    const callback: EntityPositionCallback = (entityPosition) => {
      const primitive = this.playerLocations.get(activityData.name);
      if (!primitive) return;

      this.updatePlayerLocationPrimitivePosition(primitive, entityPosition);
      this.markPlayerLocationClustersDirty();
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

      const layer = this.getPlayerActivityOverlayLayer(lastActivity.team);
      const layerName = getPlayerActivityLayerName(lastActivity.team);
      if (!layer || !layerName) return;

      let primitive = this.playerLocations.get(playerName);
      if (!primitive) primitive = this.createPlayerLocationPrimitive(layer, layerName, lastEntityPosition, lastActivity, activitiesData, playerName);
      else primitive = this.updatePlayerLocationPrimitive(primitive, layer, layerName, lastEntityPosition, lastActivity, activitiesData, playerName);

      this.setPlayerPositionSubscription(lastActivity);
      this.playerLocations.set(playerName, primitive);
      this.markPlayerLocationClustersDirty();
    } finally {
      this.playerLocationsPendingCreation.delete(playerName);
    }
  }

  private createPlayerLocationPrimitive(
    layer: LayerOverlay,
    layerName: string,
    lastEntityPosition: EntityPosition,
    lastActivityData: PlayerActivityData,
    activitiesData: PlayerActivityData[],
    playerName: string,
  ): PlayerLocation {
    const id = {
      id: `player-activity-${playerName}`,
      activities: activitiesData,
    };
    const show = !lastEntityPosition.isFallbackPosition;
    const label = layer.addLabel({
      id,
      position: lastEntityPosition.position,
      show,
      text: playerName,
      font: PLAYER_ACTIVITY_LABEL_FONT,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: lastActivityData.team === "ENLIGHTENED" ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.RIGHT,
      pixelOffset: getPlayerActivityLabelPixelOffset(lastActivityData.team),
      fillColor: getTeamColor(lastActivityData.team),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const billboard = layer.addBillboard({
      id,
      position: lastEntityPosition.position,
      show,
      image: this.getPlayerLocationBillboardImage(),
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });

    return {
      id,
      label,
      billboard,
      currentLayerName: layerName,
    };
  }

  private updatePlayerLocationPrimitive(
    primitive: PlayerLocation,
    layer: LayerOverlay,
    layerName: string,
    lastEntityPosition: EntityPosition,
    lastActivityData: PlayerActivityData,
    activitiesData: PlayerActivityData[],
    playerName: string,
  ): PlayerLocation {
    if (primitive.currentLayerName !== layerName) {
      this.removePlayerLocationPrimitive(primitive);
      return this.createPlayerLocationPrimitive(layer, layerName, lastEntityPosition, lastActivityData, activitiesData, playerName);
    }

    this.updatePlayerLocationPrimitivePosition(primitive, lastEntityPosition);
    primitive.id.activities = activitiesData;

    // For rare occasions where agents might change their faction.
    primitive.label.horizontalOrigin = lastActivityData.team === "ENLIGHTENED" ?
      Cesium.HorizontalOrigin.LEFT :
      Cesium.HorizontalOrigin.RIGHT;
    primitive.label.pixelOffset = getPlayerActivityLabelPixelOffset(lastActivityData.team);
    primitive.label.fillColor = getTeamColor(lastActivityData.team);
    this.viewer.scene.requestRender();

    return primitive;
  }

  private updatePlayerLocationPrimitivePosition(
    primitive: PlayerLocation,
    entityPosition: EntityPosition,
  ): void {
    const show = !entityPosition.isFallbackPosition;
    primitive.label.position = entityPosition.position;
    primitive.billboard.position = entityPosition.position;
    primitive.label.show = show;
    primitive.billboard.show = show;
  }

  private removePlayerLocationPrimitive(primitive: PlayerLocation): void {
    const layer = this.getPlayerActivityOverlayLayerByName(primitive.currentLayerName);
    if (!layer) return;

    layer.removeLabel(primitive.label);
    layer.removeBillboard(primitive.billboard);
    this.markPlayerLocationClustersDirty();
  }

  private refreshPlayerLocationClustersIfDirty(): void {
    if (!this.playerLocationClustersDirty) return;

    this.playerLocationClustersDirty = false;
    this.refreshPlayerLocationClusters();
  }

  private refreshPlayerLocationClusters(): void {
    const candidatesByLayerName = new Map<string, PlayerLocationClusterCandidate[]>();

    this.playerLocations.forEach((location) => {
      setPlayerLocationClusterShow(location, true);

      const candidate = this.createPlayerLocationClusterCandidate(location);
      if (!candidate) return;

      const candidates = candidatesByLayerName.get(location.currentLayerName) ?? [];
      candidates.push(candidate);
      candidatesByLayerName.set(location.currentLayerName, candidates);
    });

    let nextClusterIndex = 0;
    candidatesByLayerName.forEach((candidates, layerName) => {
      nextClusterIndex = this.clusterPlayerLocationCandidates(layerName, candidates, nextClusterIndex);
    });

    this.hideUnusedPlayerLocationClusters(nextClusterIndex);
  }

  private createPlayerLocationClusterCandidate(location: PlayerLocation): PlayerLocationClusterCandidate | undefined {
    if (!location.label.show || !location.billboard.show) return undefined;

    const windowPosition = location.billboard.computeScreenSpacePosition(this.viewer.scene);
    if (!windowPosition || !isWindowPositionInCanvas(windowPosition, this.viewer.scene.canvas)) return undefined;

    return {
      location,
      windowPosition,
      bounds: getPlayerLocationClusterBounds(location, windowPosition),
      clustered: false,
    };
  }

  private clusterPlayerLocationCandidates(
    layerName: string,
    candidates: PlayerLocationClusterCandidate[],
    clusterIndex: number,
  ): number {
    candidates.forEach((candidate) => {
      if (candidate.clustered) return;

      const clusterCandidates = this.getPlayerLocationClusterCandidates(candidate, candidates);
      if (clusterCandidates.length < PLAYER_ACTIVITY_CLUSTER_MINIMUM_SIZE) {
        candidate.clustered = true;
        return;
      }

      clusterCandidates.forEach((clusterCandidate) => {
        clusterCandidate.clustered = true;
        setPlayerLocationClusterShow(clusterCandidate.location, false);
      });
      this.showPlayerLocationCluster(clusterIndex, layerName, clusterCandidates);
      clusterIndex++;
    });

    return clusterIndex;
  }

  private getPlayerLocationClusterCandidates(
    candidate: PlayerLocationClusterCandidate,
    candidates: PlayerLocationClusterCandidate[],
  ): PlayerLocationClusterCandidate[] {
    return candidates.filter((otherCandidate) => {
      return !otherCandidate.clustered &&
        isWindowPositionInBounds(otherCandidate.windowPosition, candidate.bounds);
    });
  }

  private showPlayerLocationCluster(
    index: number,
    layerName: string,
    candidates: PlayerLocationClusterCandidate[],
  ): void {
    const cluster = this.getOrCreatePlayerLocationCluster(index, layerName);
    const ids = candidates.map(candidate => candidate.location.id);
    const position = getPlayerLocationClusterPosition(candidates);

    cluster.id = ids;
    cluster.label.id = ids;
    cluster.billboard.id = ids;
    cluster.label.position = position;
    cluster.billboard.position = position;
    cluster.label.show = true;
    cluster.billboard.show = true;
    setPlayerLocationClusterPrimitiveShow(cluster, true);
    this.applyPlayerLocationClusterStyle(cluster);
  }

  private getOrCreatePlayerLocationCluster(index: number, layerName: string): PlayerLocationCluster {
    const existing = this.playerLocationClusters[index];
    if (existing && existing.currentLayerName === layerName) return existing;

    if (existing) this.removePlayerLocationCluster(existing);

    const cluster = this.createPlayerLocationCluster(layerName);
    this.playerLocationClusters[index] = cluster;
    return cluster;
  }

  private createPlayerLocationCluster(layerName: string): PlayerLocationCluster {
    const layer = this.getPlayerActivityOverlayLayerByName(layerName);
    if (!layer) throw new Error(`Unknown player activity layer: ${layerName}`);

    const id: PlayerLocationPrimitiveId[] = [];
    return {
      id,
      label: layer.addLabel({
        id,
        position: Cesium.Cartesian3.ZERO,
        show: false,
        text: "",
        font: PLAYER_ACTIVITY_LABEL_FONT,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }),
      billboard: layer.addBillboard({
        id,
        position: Cesium.Cartesian3.ZERO,
        show: false,
        image: this.getPlayerLocationBillboardImage(),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }),
      currentLayerName: layerName,
    };
  }

  private applyPlayerLocationClusterStyle(cluster: PlayerLocationCluster): void {
    const playerActivitiesData = cluster.id
      .map(id => this.getLatestActivity(id.activities))
      .filter((activity): activity is PlayerActivityData => !!activity)
      .sort(comparePlayerActivityTimestampDescending);
    if (playerActivitiesData.length === 0) return;

    const displayText = getPlayerLocationClusterText(playerActivitiesData);
    const team = playerActivitiesData[0].team;

    cluster.label.text = displayText;
    cluster.label.font = PLAYER_ACTIVITY_LABEL_FONT;
    cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
    cluster.label.horizontalOrigin = team === "ENLIGHTENED" ?
      Cesium.HorizontalOrigin.LEFT :
      Cesium.HorizontalOrigin.RIGHT;
    cluster.label.pixelOffset = getPlayerActivityLabelPixelOffset(team);
    cluster.label.fillColor = getTeamColor(team);
    cluster.label.outlineColor = Cesium.Color.BLACK;
    cluster.label.outlineWidth = PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH;
    cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
    cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
  }

  private hideUnusedPlayerLocationClusters(firstUnusedClusterIndex: number): void {
    for (let i = firstUnusedClusterIndex; i < this.playerLocationClusters.length; i++) {
      const cluster = this.playerLocationClusters[i];
      cluster.id = [];
      cluster.label.id = cluster.id;
      cluster.billboard.id = cluster.id;
      cluster.label.show = false;
      cluster.billboard.show = false;
      setPlayerLocationClusterPrimitiveShow(cluster, false);
    }
  }

  private removePlayerLocationClusters(): void {
    this.playerLocationClusters.forEach((cluster) => this.removePlayerLocationCluster(cluster));
    this.playerLocationClusters = [];
  }

  private removePlayerLocationCluster(cluster: PlayerLocationCluster): void {
    const layer = this.getPlayerActivityOverlayLayerByName(cluster.currentLayerName);
    if (!layer) return;

    layer.removeLabel(cluster.label);
    layer.removeBillboard(cluster.billboard);
  }

  private markPlayerLocationClustersDirty(): void {
    this.playerLocationClustersDirty = true;
    this.viewer.scene.requestRender();
  }

  private getPlayerLocationBillboardImage(): HTMLCanvasElement {
    this.playerLocationBillboardImage ??= buildCanvas();
    return this.playerLocationBillboardImage;
  }

  private getPlayerActivityOverlayLayer(team: Team): LayerOverlay | undefined {
    if (team === "ENLIGHTENED") return this.overlayLayerEnl;
    if (team === "RESISTANCE") return this.overlayLayerRes;
  }

  private getPlayerActivityOverlayLayerByName(name: string): LayerOverlay | undefined {
    if (name === PLAYER_ACTIVITY_ENL_LAYER_NAME) return this.overlayLayerEnl;
    if (name === PLAYER_ACTIVITY_RES_LAYER_NAME) return this.overlayLayerRes;
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

function getPlayerActivityLayerName(team: Team): string | undefined {
  if (team === "ENLIGHTENED") return PLAYER_ACTIVITY_ENL_LAYER_NAME;
  if (team === "RESISTANCE") return PLAYER_ACTIVITY_RES_LAYER_NAME;
}

function getPlayerActivityLabelPixelOffset(team: Team): Cesium.Cartesian2 {
  return team === "ENLIGHTENED" ? new Cesium.Cartesian2(25, 0) : new Cesium.Cartesian2(-25, 0);
}

function getPlayerLocationClusterText(playerActivitiesData: PlayerActivityData[]): string {
  const visiblePlayerNames = playerActivitiesData
    .slice(0, PLAYER_ACTIVITY_CLUSTER_MAX_VISIBLE_PLAYERS)
    .map(player => player.name)
    .join("\n");
  const remainingPlayers = playerActivitiesData.length - PLAYER_ACTIVITY_CLUSTER_MAX_VISIBLE_PLAYERS;

  if (remainingPlayers === 1) {
    return `${visiblePlayerNames}\n${playerActivitiesData[PLAYER_ACTIVITY_CLUSTER_MAX_VISIBLE_PLAYERS].name}`;
  }
  if (remainingPlayers > 1) return `${visiblePlayerNames}\n(${remainingPlayers} more)`;
  return visiblePlayerNames;
}

function getPlayerLocationClusterPosition(
  candidates: PlayerLocationClusterCandidate[],
): Cesium.Cartesian3 {
  const position = new Cesium.Cartesian3();
  candidates.forEach((candidate) => {
    Cesium.Cartesian3.add(candidate.location.billboard.position, position, position);
  });
  return Cesium.Cartesian3.multiplyByScalar(position, 1 / candidates.length, position);
}

function getPlayerLocationClusterBounds(
  location: PlayerLocation,
  windowPosition: Cesium.Cartesian2,
): PlayerLocationClusterBounds {
  const billboardHalfSize = PLAYER_ACTIVITY_BILLBOARD_SIZE_PX / 2;
  const bounds = expandPlayerLocationClusterBounds({
    left: windowPosition.x - billboardHalfSize,
    top: windowPosition.y - billboardHalfSize,
    right: windowPosition.x + billboardHalfSize,
    bottom: windowPosition.y + billboardHalfSize,
  });

  return unionPlayerLocationClusterBounds(
    bounds,
    expandPlayerLocationClusterBounds(getPlayerLocationLabelBounds(location, windowPosition)),
  );
}

function getPlayerLocationLabelBounds(
  location: PlayerLocation,
  windowPosition: Cesium.Cartesian2,
): PlayerLocationClusterBounds {
  const isResistance = location.currentLayerName === PLAYER_ACTIVITY_RES_LAYER_NAME;
  const offset = isResistance ?
    getPlayerActivityLabelPixelOffset("RESISTANCE") :
    getPlayerActivityLabelPixelOffset("ENLIGHTENED");
  const width = location.label.text.length * PLAYER_ACTIVITY_LABEL_AVERAGE_CHARACTER_WIDTH_PX +
    PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH * 2;
  const height = PLAYER_ACTIVITY_LABEL_HEIGHT_PX + PLAYER_ACTIVITY_LABEL_OUTLINE_WIDTH * 2;
  const x = windowPosition.x + offset.x;
  const y = windowPosition.y + offset.y;

  if (isResistance) {
    return {
      left: x - width,
      top: y - height / 2,
      right: x,
      bottom: y + height / 2,
    };
  }

  return {
    left: x,
    top: y - height / 2,
    right: x + width,
    bottom: y + height / 2,
  };
}

function expandPlayerLocationClusterBounds(
  bounds: PlayerLocationClusterBounds,
): PlayerLocationClusterBounds {
  return {
    left: bounds.left - PLAYER_ACTIVITY_CLUSTER_PIXEL_RANGE,
    top: bounds.top - PLAYER_ACTIVITY_CLUSTER_PIXEL_RANGE,
    right: bounds.right + PLAYER_ACTIVITY_CLUSTER_PIXEL_RANGE,
    bottom: bounds.bottom + PLAYER_ACTIVITY_CLUSTER_PIXEL_RANGE,
  };
}

function unionPlayerLocationClusterBounds(
  a: PlayerLocationClusterBounds,
  b: PlayerLocationClusterBounds,
): PlayerLocationClusterBounds {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function isWindowPositionInBounds(
  position: Cesium.Cartesian2,
  bounds: PlayerLocationClusterBounds,
): boolean {
  return position.x >= bounds.left &&
    position.x <= bounds.right &&
    position.y >= bounds.top &&
    position.y <= bounds.bottom;
}

function isWindowPositionInCanvas(
  position: Cesium.Cartesian2,
  canvas: HTMLCanvasElement,
): boolean {
  return position.x >= 0 &&
    position.x <= canvas.clientWidth &&
    position.y >= 0 &&
    position.y <= canvas.clientHeight;
}

function setPlayerLocationClusterShow(location: PlayerLocation, show: boolean): void {
  setClusterShow(location.label, show);
  setClusterShow(location.billboard, show);
}

function setPlayerLocationClusterPrimitiveShow(cluster: PlayerLocationCluster, show: boolean): void {
  setClusterShow(cluster.label, show);
  setClusterShow(cluster.billboard, show);
}

function setClusterShow(primitive: Cesium.Label | Cesium.Billboard, show: boolean): void {
  (primitive as Cesium.Label & Cesium.Billboard & { clusterShow: boolean }).clusterShow = show;
}

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
