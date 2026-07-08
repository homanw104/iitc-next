/**
 * Manage portal label primitives.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal.ts";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import {
  PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_LABEL_ENTITY_FONT,
  PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
  PORTAL_LABEL_ENTITY_OUTLINE_WIDTH,
  createPortalLabelEntityPixelOffset,
  createPortalLabelEntityPixelOffsetScaleByDistance,
  getPortalLabelLinkCount,
  getPortalLabelEntityTextLayout,
} from "./portalLabelEntityLayout";
import { getPortalLabelEntityLayerId } from "./portalEntityLayers";
import { PortalLabelEntityCameraMoveTracker } from "./portalLabelEntityCamera";
import {
  didPortalLabelEntityFadeChange,
  isPortalLabelEntityFadeTargetVisible,
  isPortalLabelEntityFadeComplete,
  isPortalLabelEntityFadingOut,
  setPortalLabelEntityTargetVisibility,
  updatePortalLabelEntityFade,
} from "./portalLabelEntityFade";
import { getNonOverlappingPortalLabelEntityGuids } from "./portalLabelEntityOverlap";
import type { PortalLabel, PortalLabelTextLayout } from "./portalLabelEntityTypes";
import {
  PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS,
  PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_SIZE,
  takePortalLabelEntityGuidBatch,
} from "./portalLabelEntityVisibility";

export class PortalLabelEntityManager {
  private labels: Map<string, PortalLabel> = new Map();
  private labelsPendingCreation: Set<string> = new Set();
  private visibilityQueuedGuids: Set<string> = new Set();
  private visibilityUpdateScheduled = false;
  private overlapVisibleGuids: Set<string> = new Set();
  private overlapDirty = true;
  private fadingLabelGuids: Set<string> = new Set();
  private fadeFrame: number | undefined;
  private pendingOverlapRevealGuids: Set<string> | undefined;
  private pendingOverlapRevealGeneration: number | undefined;
  private hasDeferredVisibilityUpdate = false;
  private deferredVisibilityUpdateDepth = 0;
  private overlapRefreshGeneration = 0;
  private hasPositionSettledVisibilityUpdate = false;
  private cameraMoveTracker: PortalLabelEntityCameraMoveTracker;

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {
    this.cameraMoveTracker = new PortalLabelEntityCameraMoveTracker(
      this.viewer,
      () => this.overlapRefreshGeneration++,
      () => this.queueAllVisibilityUpdates(),
    );
  }

  public async addOrUpdateLabels(portals: PortalData[]): Promise<void> {
    await this.deferVisibilityUpdates(async () => {
      await Promise.all(portals.map((portalData) => this.addOrUpdateLabel(portalData)));
    });
  }

  public async addOrUpdateLabel(data: PortalData): Promise<void> {
    const existing = this.labels.get(data.guid);
    if (existing) {
      await this.updateExistingLabel(existing, data);
    } else {
      await this.createAndStoreLabel(data);
    }
  }

  public removeLabelsInView(viewRect: Cesium.Rectangle): void {
    this.removeLabelEntitiesInView(viewRect);
  }

  private async updateExistingLabel(label: PortalLabel, data: PortalData): Promise<void> {
    const title = data.title || "";
    const layout = getPortalLabelEntityTextLayout(title);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);
    this.moveLabelToLayer(label, getPortalLabelEntityLayerId(data));
    this.updateLabelEntity(label, layout, entityPosition);
    this.updateLabelPositionSubscription(label, data);
    label.wrappedText = layout.wrappedText;
    label.screenBoxWidth = layout.screenBoxWidth;
    label.screenBoxHeight = layout.screenBoxHeight;
    label.linkCount = getPortalLabelLinkCount(data);
    label.data = data;
    this.queueAllVisibilityUpdates();
  }

  private async createAndStoreLabel(data: PortalData): Promise<void> {
    if (this.labelsPendingCreation.has(data.guid)) return;

    this.labelsPendingCreation.add(data.guid);
    try {
      const title = data.title || "";
      const layout = getPortalLabelEntityTextLayout(title);
      const entityPosition = await this.entityPositionManager.getEntityPosition(data);

      const label = {
        data,
        primitive: this.createLabelPrimitive(
          data,
          layout,
          entityPosition.position,
          PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
          false,
        ),
        position: Cesium.Cartesian3.clone(entityPosition.position),
        positionCallback: this.createLabelPositionCallback(data.guid),
        wrappedText: layout.wrappedText,
        screenBoxWidth: layout.screenBoxWidth,
        screenBoxHeight: layout.screenBoxHeight,
        isFallbackPosition: entityPosition.isFallbackPosition,
        currentOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeStartOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeTargetOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeStartTime: 0,
        firstShownAt: undefined,
        linkCount: getPortalLabelLinkCount(data),
        currentLayerId: getPortalLabelEntityLayerId(data),
      };
      this.labels.set(data.guid, label);
      this.entityPositionManager.setOnPositionChangedCallback(data, label.positionCallback);
      this.queueVisibilityUpdate(data.guid, true);
    } finally {
      this.labelsPendingCreation.delete(data.guid);
    }
  }

  private createLabelPrimitive(
    data: PortalData,
    layout: PortalLabelTextLayout,
    position: Cesium.Cartesian3,
    opacity: number,
    show: boolean,
    layerId = getPortalLabelEntityLayerId(data),
  ): Cesium.Label {
    return this.layerManager.getOrCreateOverlayLayer(layerId).addLabel({
      id: `label-${data.guid}`,
      position,
      show,
      text: layout.wrappedText,
      font: PORTAL_LABEL_ENTITY_FONT,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE.withAlpha(opacity),
      outlineColor: Cesium.Color.BLACK.withAlpha(opacity),
      outlineWidth: PORTAL_LABEL_ENTITY_OUTLINE_WIDTH,
      showBackground: false,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: createPortalLabelEntityPixelOffset(),
      pixelOffsetScaleByDistance: createPortalLabelEntityPixelOffsetScaleByDistance(),
    });
  }

  private createLabelPositionCallback(guid: string): EntityPositionCallback {
    return (entityPosition) => {
      const label = this.labels.get(guid);
      if (!label) return;

      const title = label.data.title || "";
      const layout = getPortalLabelEntityTextLayout(title);
      this.updateLabelEntity(label, layout, entityPosition);
      this.queueVisibilityUpdateAfterEntityPositionsSettle();
    };
  }

  private updateLabelEntity(label: PortalLabel, layout: PortalLabelTextLayout, entityPosition: EntityPosition): void {
    Cesium.Cartesian3.clone(entityPosition.position, label.position);
    label.primitive.position = label.position;
    label.isFallbackPosition = entityPosition.isFallbackPosition;
    if (label.isFallbackPosition) this.setLabelTargetVisibility(label, false);
    label.primitive.text = layout.wrappedText;
    this.viewer.scene.requestRender();
  }

  private updateLabelPositionSubscription(label: PortalLabel, data: PortalData): void {
    if (label.data.latE6 === data.latE6 && label.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnPositionChangedCallback(label.data, label.positionCallback);
    this.entityPositionManager.setOnPositionChangedCallback(data, label.positionCallback);
  }

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (labelInfo) {
      this.layerManager.getOrCreateOverlayLayer(labelInfo.currentLayerId).removeLabel(labelInfo.primitive);
      this.entityPositionManager.unsetOnPositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
      this.labels.delete(guid);
      this.queueAllVisibilityUpdates();
    }
    this.labelsPendingCreation.delete(guid);
    this.visibilityQueuedGuids.delete(guid);
    this.fadingLabelGuids.delete(guid);
  }

  private removeLabelEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.labels.forEach((portalLabel, guid) => {
      const position = portalLabel.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    if (toRemove.length === 0) return;

    toRemove.forEach(guid => this.removeLabelEntity(guid));
  }

  private moveLabelToLayer(label: PortalLabel, newLayerId: string): void {
    if (label.currentLayerId === newLayerId) return;

    const show = label.primitive.show;
    this.layerManager.getOrCreateOverlayLayer(label.currentLayerId).removeLabel(label.primitive);
    label.primitive = this.createLabelPrimitive(
      label.data,
      {
        wrappedText: label.wrappedText,
        screenBoxWidth: label.screenBoxWidth,
        screenBoxHeight: label.screenBoxHeight,
      },
      label.position,
      label.currentOpacity,
      show,
      newLayerId,
    );
    label.currentLayerId = newLayerId;
  }

  private queueAllVisibilityUpdates(): void {
    this.overlapDirty = true;

    if (this.deferredVisibilityUpdateDepth > 0) {
      this.hasDeferredVisibilityUpdate = true;
    } else {
      this.cameraMoveTracker.captureSnapshot();
      this.scheduleVisibilityUpdates();
    }
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

  private queueVisibilityUpdateAfterEntityPositionsSettle(): void {
    this.overlapDirty = true;

    if (this.deferredVisibilityUpdateDepth > 0) {
      this.hasDeferredVisibilityUpdate = true;
      return;
    }

    if (this.hasPositionSettledVisibilityUpdate) return;
    this.hasPositionSettledVisibilityUpdate = true;

    this.entityPositionManager.runAfterSamplingWork(() => {
      this.hasPositionSettledVisibilityUpdate = false;

      if (this.deferredVisibilityUpdateDepth > 0) {
        this.hasDeferredVisibilityUpdate = true;
        return;
      }

      this.cameraMoveTracker.captureSnapshot();
      this.scheduleVisibilityUpdates();
    });
  }

  private async deferVisibilityUpdates(callback: () => Promise<void>): Promise<void> {
    this.deferredVisibilityUpdateDepth++;
    try {
      await callback();
    } finally {
      this.deferredVisibilityUpdateDepth--;
      if (this.deferredVisibilityUpdateDepth === 0 && this.hasDeferredVisibilityUpdate) {
        this.hasDeferredVisibilityUpdate = false;
        this.cameraMoveTracker.captureSnapshot();
        this.scheduleVisibilityUpdates();
      }
    }
  }

  private scheduleVisibilityUpdates(delayMs = 0): void {
    if (this.visibilityUpdateScheduled) return;

    this.visibilityUpdateScheduled = true;
    window.setTimeout(() => this.flushVisibilityQueue(), delayMs);
  }

  private async flushVisibilityQueue(): Promise<void> {
    this.visibilityUpdateScheduled = false;

    const time = Cesium.JulianDate.now();
    let changed = false;
    if (this.overlapDirty) changed = await this.refreshLabelOverlaps(time);

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

      if (this.shouldWaitForRejectedOverlapFade(guid, label)) return;
      if (this.setLabelTargetVisibility(label, true)) changed = true;
    });

    if (changed) this.viewer.scene.requestRender();
    if (this.visibilityQueuedGuids.size > 0) this.scheduleVisibilityUpdates(PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS);
  }

  private async refreshLabelOverlaps(time: Cesium.JulianDate): Promise<boolean> {
    const overlapRefreshGeneration = ++this.overlapRefreshGeneration;
    this.overlapDirty = false;
    this.clearPendingOverlapReveal();

    const nextOverlapVisibleGuids = await getNonOverlappingPortalLabelEntityGuids(
      this.viewer,
      this.labels,
      time,
      () => overlapRefreshGeneration === this.overlapRefreshGeneration,
      { isCameraMoving: () => this.cameraMoveTracker.getIsMoving() },
    );
    if (overlapRefreshGeneration !== this.overlapRefreshGeneration) return false;

    this.overlapVisibleGuids = nextOverlapVisibleGuids;

    const { changed, hasLabelsFadingOut } = this.hideRejectedOverlapLabels(nextOverlapVisibleGuids);
    if (hasLabelsFadingOut) {
      this.deferAcceptedOverlapLabelsUntilRejectedFade(nextOverlapVisibleGuids, overlapRefreshGeneration);
      return changed;
    }

    return this.showAcceptedOverlapLabels(nextOverlapVisibleGuids) || changed;
  }

  private hideRejectedOverlapLabels(acceptedGuids: Set<string>): {
    changed: boolean;
    hasLabelsFadingOut: boolean
  } {
    let changed = false;
    let hasLabelsFadingOut = false;

    this.labels.forEach((label, guid) => {
      if (acceptedGuids.has(guid)) return;

      this.visibilityQueuedGuids.delete(guid);
      if (this.setLabelTargetVisibility(label, false)) changed = true;
      if (isPortalLabelEntityFadingOut(label)) hasLabelsFadingOut = true;
    });

    return { changed, hasLabelsFadingOut };
  }

  private showAcceptedOverlapLabels(acceptedGuids: Set<string>): boolean {
    let changed = false;

    acceptedGuids.forEach((guid) => {
      const label = this.labels.get(guid);
      if (!label) return;

      this.visibilityQueuedGuids.delete(guid);
      if (this.setLabelTargetVisibility(label, true)) changed = true;
    });

    return changed;
  }

  private deferAcceptedOverlapLabelsUntilRejectedFade(
    acceptedGuids: Set<string>,
    overlapRefreshGeneration: number,
  ): void {
    this.pendingOverlapRevealGuids = acceptedGuids;
    this.pendingOverlapRevealGeneration = overlapRefreshGeneration;
  }

  private revealPendingAcceptedOverlapLabels(): boolean {
    const acceptedGuids = this.pendingOverlapRevealGuids;
    const overlapRefreshGeneration = this.pendingOverlapRevealGeneration;
    this.clearPendingOverlapReveal();

    if (!acceptedGuids) return false;
    if (overlapRefreshGeneration !== this.overlapRefreshGeneration) {
      this.queueAllVisibilityUpdates();
      return false;
    }

    return this.showAcceptedOverlapLabels(acceptedGuids);
  }

  private clearPendingOverlapReveal(): void {
    this.pendingOverlapRevealGuids = undefined;
    this.pendingOverlapRevealGeneration = undefined;
  }

  private shouldWaitForRejectedOverlapFade(guid: string, label: PortalLabel): boolean {
    return this.pendingOverlapRevealGuids?.has(guid) === true &&
      !isPortalLabelEntityFadeTargetVisible(label);
  }

  private setLabelTargetVisibility(label: PortalLabel, visible: boolean): boolean {
    const shouldShow = visible && !label.isFallbackPosition;
    if (!setPortalLabelEntityTargetVisibility(label, shouldShow)) return false;

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

      const result = updatePortalLabelEntityFade(label, timestamp);
      if (didPortalLabelEntityFadeChange(result)) changed = true;
      if (isPortalLabelEntityFadeComplete(result)) this.fadingLabelGuids.delete(guid);
    });

    if (!this.hasAnyLabelFadingOut() && this.revealPendingAcceptedOverlapLabels()) changed = true;
    if (changed) this.viewer.scene.requestRender();
    if (this.fadingLabelGuids.size > 0) this.scheduleLabelFade();
  }

  private hasAnyLabelFadingOut(): boolean {
    for (const guid of this.fadingLabelGuids) {
      const label = this.labels.get(guid);
      if (label && isPortalLabelEntityFadingOut(label)) return true;
    }

    return false;
  }
}
