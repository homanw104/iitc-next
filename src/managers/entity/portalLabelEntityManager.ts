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
  PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
  PORTAL_LABEL_ENTITY_OUTLINE_WIDTH,
  createPortalLabelEntityPixelOffsetCallback,
  getPortalLabelEntityLinkCount,
  getPortalLabelEntityPosition,
  getPortalLabelEntityTextLayout,
  setPortalLabelEntityOpacityCallbackProperties,
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

  public async addOrUpdateLabel(data: PortalData): Promise<void> {
    const title = data.title;
    const existing = this.labels.get(data.guid);
    if (existing) {
      await this.updateExistingLabel(existing, data, title ?? "");
    } else {
      await this.createAndStoreLabel(data, title ?? "");
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
          await Promise.all(portals.map((portalData) => this.addOrUpdateLabel(portalData)));
        }
      );
    });
  }

  public removeLabelsInView(viewRect: Cesium.Rectangle): void {
    this.removeLabelEntitiesInView(viewRect);
  }

  private async updateExistingLabel(label: PortalLabel, data: PortalData, title: string): Promise<void> {
    const layout = getPortalLabelEntityTextLayout(title);
    this.moveLabelToLayer(label, getPortalLabelEntityLayerId(data));
    await this.updateLabelEntity(label.entity, data, layout.wrappedText);
    this.updateLabelPositionSubscription(label, data);
    this.updateLabelState(label, data, layout);
    this.queueAllVisibilityUpdates();
  }

  private async createAndStoreLabel(data: PortalData, title: string): Promise<void> {
    if (this.labelsPendingCreation.has(data.guid)) return;

    this.labelsPendingCreation.add(data.guid);
    try {
      const layout = getPortalLabelEntityTextLayout(title);
      const entity = await this.createLabelEntity(data, layout.wrappedText);
      const positionCallback = this.createLabelPositionCallback(entity);
      this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);

      const label: PortalLabel = {
        data,
        entity,
        positionCallback,
        wrappedText: layout.wrappedText,
        screenBoxWidth: layout.screenBoxWidth,
        screenBoxHeight: layout.screenBoxHeight,
        linkCount: getPortalLabelEntityLinkCount(data),
        currentOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeStartOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeTargetOpacity: PORTAL_LABEL_ENTITY_INITIAL_OPACITY,
        fadeStartTime: 0,
        firstShownAt: undefined,
        currentLayerId: getPortalLabelEntityLayerId(data),
      };
      setPortalLabelEntityOpacityCallbackProperties(label);
      this.labels.set(data.guid, label);
      this.queueVisibilityUpdate(data.guid, true);
    } finally {
      this.labelsPendingCreation.delete(data.guid);
    }
  }

  private async createLabelEntity(data: PortalData, wrappedText: string): Promise<Cesium.Entity> {
    const layerId = getPortalLabelEntityLayerId(data);
    const entities = this.layerManager.getOrCreateOverlayLayer(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);
    const entityReference: { entity?: Cesium.Entity } = {};

    const entity = entities.add({
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
        pixelOffset: createPortalLabelEntityPixelOffsetCallback(
          this.viewer,
          (time) => entityReference.entity?.position?.getValue(time) ?? position,
        ),
      },
    });
    entityReference.entity = entity;

    return entity;
  }

  private createLabelPositionCallback(entity: Cesium.Entity): EntityPositionCallback {
    return (_latE6, _lngE6, position) => {
      entity.position = new Cesium.ConstantPositionProperty(position);
      this.queueVisibilityUpdateAfterEntityPositionsSettle();
    };
  }

  private updateLabelState(
    label: PortalLabel,
    data: PortalData,
    layout: PortalLabelTextLayout,
  ): void {
    label.wrappedText = layout.wrappedText;
    label.screenBoxWidth = layout.screenBoxWidth;
    label.screenBoxHeight = layout.screenBoxHeight;
    label.linkCount = getPortalLabelEntityLinkCount(data);
    label.data = data;
  }

  private async updateLabelEntity(entity: Cesium.Entity, data: PortalData, wrappedText: string): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);

    entity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(wrappedText);
    }
  }

  private updateLabelPositionSubscription(label: PortalLabel, data: PortalData): void {
    if (label.data.latE6 === data.latE6 && label.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(label.data, label.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, label.positionCallback);
  }

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (labelInfo) {
      const entities = this.layerManager.getOrCreateOverlayLayer(labelInfo.currentLayerId).entities;

      entities.remove(labelInfo.entity);
      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
      this.labels.delete(guid);
      this.queueAllVisibilityUpdates();
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

  private moveLabelToLayer(labelInfo: PortalLabel, newLayerId: string): void {
    if (labelInfo.currentLayerId === newLayerId) return;

    this.layerManager.getOrCreateOverlayLayer(labelInfo.currentLayerId).entities.remove(labelInfo.entity);
    this.layerManager.getOrCreateOverlayLayer(newLayerId).entities.add(labelInfo.entity);
    labelInfo.currentLayerId = newLayerId;
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

    this.entityPositionManager.runAfterRenderedHeightRefresh(() => {
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
    if (!setPortalLabelEntityTargetVisibility(label, visible)) return false;

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
