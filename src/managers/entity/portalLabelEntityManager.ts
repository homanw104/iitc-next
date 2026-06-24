/**
 * Manage portal label entities.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import {
  PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_LABEL_ENTITY_FONT,
  PORTAL_LABEL_ENTITY_HIDDEN_OPACITY,
  PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
  PORTAL_LABEL_ENTITY_OUTLINE_WIDTH,
  PORTAL_LABEL_ENTITY_PIXEL_OFFSET_Y,
  PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  getPortalLabelEntityLayerId,
  getPortalLabelEntityLinkCount,
  getPortalLabelEntityPosition,
  getPortalLabelEntityTextLayout,
  setPortalLabelEntityColorCallbackProperties,
  setPortalLabelEntityOpacity,
} from "./portalLabelEntityLayout";
import { getNonOverlappingPortalLabelEntityGuids } from "./portalLabelEntityOverlap";
import type { PortalLabelEntity } from "./portalLabelEntityTypes";
import {
  PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS,
  PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_SIZE,
  isPortalLabelEntityPositionVisible,
  takePortalLabelEntityGuidBatch,
} from "./portalLabelEntityVisibility";

const LABEL_FADE_DURATION_MS = 200;

const LABEL_CAMERA_MOVE_VISIBILITY_UPDATE_INTERVAL_MS = 3000;
const LABEL_CAMERA_MOVE_MIN_POSITION_METERS = 5;
const LABEL_CAMERA_MOVE_HEIGHT_FACTOR = 0.01;
const LABEL_CAMERA_MOVE_MIN_ANGLE_RADIANS = Cesium.Math.toRadians(0.5);

const labelCameraCartographicScratch = new Cesium.Cartographic();

export class PortalLabelEntityManager {
  private labels: Map<string, PortalLabelEntity> = new Map();
  private labelsPendingCreation: Set<string> = new Set();
  private visibilityQueuedGuids: Set<string> = new Set();
  private visibilityUpdateScheduled = false;
  private forceVisibilityRefresh = false;
  private isCameraMoving = false;
  private lastMovingVisibilityUpdate = 0;
  private overlapVisibleGuids: Set<string> = new Set();
  private overlapDirty = true;
  private fadingLabelGuids: Set<string> = new Set();
  private fadeFrame: number | undefined;
  private hasVisibilityCameraSnapshot = false;
  private lastVisibilityCameraPosition = new Cesium.Cartesian3();
  private lastVisibilityCameraDirection = new Cesium.Cartesian3();
  private lastVisibilityCameraUp = new Cesium.Cartesian3();
  private deferredVisibilityUpdateDepth = 0;
  private hasDeferredVisibilityUpdate = false;
  private deferredVisibilityForceRefresh = false;

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {
    this.viewer.camera.moveStart.addEventListener(() => {
      this.isCameraMoving = true;
      this.lastMovingVisibilityUpdate = performance.now();
    });
    this.viewer.camera.moveEnd.addEventListener(() => {
      this.isCameraMoving = false;
    });
    this.viewer.scene.preRender.addEventListener(() => {
      if (!this.isCameraMoving) return;

      const now = performance.now();
      if (now - this.lastMovingVisibilityUpdate < LABEL_CAMERA_MOVE_VISIBILITY_UPDATE_INTERVAL_MS) return;
      if (!this.hasCameraMovedEnoughForVisibility()) return;

      this.lastMovingVisibilityUpdate = now;
      this.queueAllVisibilityUpdates(false);
    });
  }

  public async addOrUpdateLabel(data: PortalData): Promise<void> {
    if (!data.title) {
      this.removeLabel(data.guid);
      return;
    }

    const existing = this.labels.get(data.guid);
    if (existing) {
      const layout = getPortalLabelEntityTextLayout(data.title || "");
      const newLayerId = getPortalLabelEntityLayerId(data);
      this.moveLabelToLayer(existing, newLayerId);
      await this.updateLabelEntity(existing.entity, data, layout.wrappedText);
      this.updateLabelPositionSubscription(existing, data);
      existing.wrappedText = layout.wrappedText;
      existing.screenBoxWidth = layout.screenBoxWidth;
      existing.screenBoxHeight = layout.screenBoxHeight;
      existing.linkCount = getPortalLabelEntityLinkCount(data);
      existing.data = data;
      this.queueAllVisibilityUpdates(true);
    } else {
      if (this.labelsPendingCreation.has(data.guid)) return;
      this.labelsPendingCreation.add(data.guid);
      try {
        const layout = getPortalLabelEntityTextLayout(data.title || "");
        const entity = await this.createLabelEntity(data, layout.wrappedText);
        const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
          entity.position = new Cesium.ConstantPositionProperty(position);
          this.queueAllVisibilityUpdates(true);
        };
        this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
        const label: PortalLabelEntity = {
          data,
          entity,
          positionCallback,
          wrappedText: layout.wrappedText,
          screenBoxWidth: layout.screenBoxWidth,
          screenBoxHeight: layout.screenBoxHeight,
          linkCount: getPortalLabelEntityLinkCount(data),
          opacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
          targetOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
          fadeStartOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
          fadeStartTime: 0,
          currentLayerId: getPortalLabelEntityLayerId(data),
        };
        setPortalLabelEntityColorCallbackProperties(label);
        this.labels.set(data.guid, label);
        this.queueVisibilityUpdate(data.guid, true);
      } finally {
        this.labelsPendingCreation.delete(data.guid);
      }
    }
  }

  public async addOrUpdateLabels(portals: PortalData[]): Promise<void> {
    const layers = new Set<string>();
    portals.forEach((portal) => {
      const existing = this.labels.get(portal.guid);
      if (existing) layers.add(existing.currentLayerId);
      if (portal.title) layers.add(getPortalLabelEntityLayerId(portal));
    });

    await this.deferVisibilityUpdates(async () => {
      await this.layerManager.withEntityCollectionEventsSuspended(
        Array.from(layers, (name) => ({ name, type: "overlay" as const })),
        async () => {
          await Promise.all(portals.map((portal) => this.addOrUpdateLabel(portal)));
        }
      );
    });
  }

  public removeLabel(guid: string): void {
    this.removeLabelEntity(guid);
  }

  public removeLabelsInView(viewRect: Cesium.Rectangle): void {
    this.removeLabelEntitiesInView(viewRect);
  }

  private async createLabelEntity(data: PortalData, wrappedText: string): Promise<Cesium.Entity> {
    const layerId = getPortalLabelEntityLayerId(data);
    const entities = this.layerManager.getOrCreateOverlay(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    return entities.add({
      id: `label-${data.guid}`,
      position: position,
      show: false,
      label: {
        text: wrappedText,
        font: PORTAL_LABEL_ENTITY_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE.withAlpha(PORTAL_LABEL_ENTITY_INITIAL_OPACITY),
        outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_LABEL_ENTITY_INITIAL_OPACITY),
        outlineWidth: PORTAL_LABEL_ENTITY_OUTLINE_WIDTH,
        showBackground: false,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, PORTAL_LABEL_ENTITY_PIXEL_OFFSET_Y),
      },
      properties: {
        selectable: false,
      },
    });
  }

  private async updateLabelEntity(entity: Cesium.Entity, data: PortalData, wrappedText: string): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);

    entity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(wrappedText);
    }
  }

  private updateLabelPositionSubscription(labelInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (labelInfo.data.latE6 === data.latE6 && labelInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, labelInfo.positionCallback);
  }

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (labelInfo) {
      const entities = this.layerManager.getOrCreateOverlay(labelInfo.currentLayerId).entities;

      entities.remove(labelInfo.entity);
      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
      this.labels.delete(guid);
      this.queueAllVisibilityUpdates(false);
    }
    this.labelsPendingCreation.delete(guid);
    this.visibilityQueuedGuids.delete(guid);
    this.fadingLabelGuids.delete(guid);
  }

  private removeLabelEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    const time = Cesium.JulianDate.now();
    this.labels.forEach((info, guid) => {
      const position = getPortalLabelEntityPosition(info, time);
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
          layers.add(info.currentLayerId);
        }
      }
    });
    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "overlay" as const })),
      () => toRemove.forEach(guid => this.removeLabelEntity(guid))
    );
  }

  private moveLabelToLayer(labelInfo: PortalLabelEntity, newLayerId: string): void {
    if (labelInfo.currentLayerId === newLayerId) return;

    this.layerManager.getOrCreateOverlay(labelInfo.currentLayerId).entities.remove(labelInfo.entity);
    this.layerManager.getOrCreateOverlay(newLayerId).entities.add(labelInfo.entity);
    labelInfo.currentLayerId = newLayerId;
  }

  private queueAllVisibilityUpdates(forceVisibilityRefresh = true): void {
    if (this.deferredVisibilityUpdateDepth > 0) {
      this.overlapDirty = true;
      this.hasDeferredVisibilityUpdate = true;
      if (forceVisibilityRefresh) this.deferredVisibilityForceRefresh = true;
      return;
    }

    this.captureVisibilityCameraSnapshot();
    this.overlapDirty = true;
    if (forceVisibilityRefresh) this.forceVisibilityRefresh = true;
    this.scheduleVisibilityUpdates();
  }

  private queueVisibilityUpdate(guid: string, overlapDirty = false): void {
    if (overlapDirty) this.overlapDirty = true;
    this.visibilityQueuedGuids.add(guid);
    if (this.deferredVisibilityUpdateDepth > 0) {
      this.hasDeferredVisibilityUpdate = true;
      return;
    }
    this.scheduleVisibilityUpdates();
  }

  private async deferVisibilityUpdates(callback: () => Promise<void>): Promise<void> {
    this.deferredVisibilityUpdateDepth++;
    try {
      await callback();
    } finally {
      this.deferredVisibilityUpdateDepth--;
      if (this.deferredVisibilityUpdateDepth === 0 && this.hasDeferredVisibilityUpdate) {
        this.hasDeferredVisibilityUpdate = false;
        this.captureVisibilityCameraSnapshot();
        if (this.deferredVisibilityForceRefresh) {
          this.forceVisibilityRefresh = true;
          this.deferredVisibilityForceRefresh = false;
        }
        this.scheduleVisibilityUpdates();
      }
    }
  }

  private scheduleVisibilityUpdates(delayMs = 0): void {
    if (this.visibilityUpdateScheduled) return;

    this.visibilityUpdateScheduled = true;
    window.setTimeout(() => this.flushVisibilityQueue(), delayMs);
  }

  private flushVisibilityQueue(): void {
    this.visibilityUpdateScheduled = false;

    const time = Cesium.JulianDate.now();
    let changed = false;
    if (this.overlapDirty) changed = this.refreshLabelOverlaps(time);

    const guids = takePortalLabelEntityGuidBatch(this.visibilityQueuedGuids, PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_SIZE);
    if (guids.length === 0) {
      if (changed) this.viewer.scene.requestRender();
      return;
    }

    guids.forEach((guid) => {
      const label = this.labels.get(guid);
      if (!label) return;

      if (!this.overlapVisibleGuids.has(guid)) {
        if (this.setLabelTargetVisibility(label, false)) changed = true;
        return;
      }

      const labelPosition = getPortalLabelEntityPosition(label, time);
      if (!labelPosition) {
        if (this.setLabelTargetVisibility(label, false)) changed = true;
        return;
      }

      const visible = isPortalLabelEntityPositionVisible(this.viewer, labelPosition);
      if (this.setLabelTargetVisibility(label, visible)) changed = true;
    });

    if (changed) this.viewer.scene.requestRender();
    if (this.visibilityQueuedGuids.size > 0) this.scheduleVisibilityUpdates(PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS);
  }

  private refreshLabelOverlaps(time: Cesium.JulianDate): boolean {
    this.overlapDirty = false;
    const previousOverlapVisibleGuids = this.overlapVisibleGuids;
    const forceVisibilityRefresh = this.forceVisibilityRefresh;
    this.forceVisibilityRefresh = false;
    this.overlapVisibleGuids = getNonOverlappingPortalLabelEntityGuids(this.viewer, this.labels, time);

    let changed = false;
    this.labels.forEach((label, guid) => {
      if (this.overlapVisibleGuids.has(guid)) {
        if (forceVisibilityRefresh || !previousOverlapVisibleGuids.has(guid)) {
          this.visibilityQueuedGuids.add(guid);
        }
        return;
      }

      this.visibilityQueuedGuids.delete(guid);
      if (this.setLabelTargetVisibility(label, false)) changed = true;
    });
    return changed;
  }

  private setLabelTargetVisibility(label: PortalLabelEntity, visible: boolean): boolean {
    const targetOpacity = visible ? PORTAL_LABEL_ENTITY_VISIBLE_OPACITY : PORTAL_LABEL_ENTITY_HIDDEN_OPACITY;
    if (label.targetOpacity === targetOpacity) return false;

    label.targetOpacity = targetOpacity;
    label.fadeStartOpacity = label.opacity;
    label.fadeStartTime = performance.now();
    if (visible) label.entity.show = true;

    this.fadingLabelGuids.add(label.data.guid);
    this.scheduleLabelFade();
    return true;
  }

  private scheduleLabelFade(): void {
    if (this.fadeFrame !== undefined) return;

    this.fadeFrame = window.requestAnimationFrame((timestamp) => {
      this.updateLabelFades(timestamp);
    });
  }

  private updateLabelFades(timestamp: number): void {
    this.fadeFrame = undefined;

    let changed = false;
    this.fadingLabelGuids.forEach((guid) => {
      const label = this.labels.get(guid);
      if (!label) {
        this.fadingLabelGuids.delete(guid);
        return;
      }

      const progress = Cesium.Math.clamp((timestamp - label.fadeStartTime) / LABEL_FADE_DURATION_MS, 0, 1);
      const opacity = Cesium.Math.lerp(label.fadeStartOpacity, label.targetOpacity, smoothstep(progress));
      if (setPortalLabelEntityOpacity(label, opacity)) changed = true;

      if (progress < 1) return;

      setPortalLabelEntityOpacity(label, label.targetOpacity);
      if (label.targetOpacity === PORTAL_LABEL_ENTITY_HIDDEN_OPACITY && label.entity.show) {
        label.entity.show = false;
        changed = true;
      }
      this.fadingLabelGuids.delete(guid);
    });

    if (changed) this.viewer.scene.requestRender();
    if (this.fadingLabelGuids.size > 0) this.scheduleLabelFade();
  }

  private hasCameraMovedEnoughForVisibility(): boolean {
    if (!this.hasVisibilityCameraSnapshot) return true;

    const camera = this.viewer.camera;
    const height = this.viewer.scene.globe.ellipsoid.cartesianToCartographic(
      camera.positionWC,
      labelCameraCartographicScratch,
    )?.height ?? 0;
    const positionThreshold = Math.max(
      LABEL_CAMERA_MOVE_MIN_POSITION_METERS,
      Math.abs(height) * LABEL_CAMERA_MOVE_HEIGHT_FACTOR,
    );
    if (Cesium.Cartesian3.distance(camera.positionWC, this.lastVisibilityCameraPosition) >= positionThreshold) {
      return true;
    }

    const angleThresholdCosine = Math.cos(LABEL_CAMERA_MOVE_MIN_ANGLE_RADIANS);
    return Cesium.Cartesian3.dot(camera.directionWC, this.lastVisibilityCameraDirection) <= angleThresholdCosine ||
      Cesium.Cartesian3.dot(camera.upWC, this.lastVisibilityCameraUp) <= angleThresholdCosine;
  }

  private captureVisibilityCameraSnapshot(): void {
    Cesium.Cartesian3.clone(this.viewer.camera.positionWC, this.lastVisibilityCameraPosition);
    Cesium.Cartesian3.clone(this.viewer.camera.directionWC, this.lastVisibilityCameraDirection);
    Cesium.Cartesian3.clone(this.viewer.camera.upWC, this.lastVisibilityCameraUp);
    this.hasVisibilityCameraSnapshot = true;
  }

}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
