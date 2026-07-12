/**
 * Manages portal label primitives.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { createPortalPrimitiveId } from "./portalManager";
import { PortalLabelCameraMoveTracker } from "./portalLabelCamera";
import {
  PORTAL_LABEL_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_LABEL_FONT,
  PORTAL_LABEL_INITIAL_OPACITY,
  PORTAL_LABEL_OUTLINE_WIDTH,
  createPortalLabelPixelOffset,
  createPortalLabelPixelOffsetScaleByDistance,
  getPortalLabelLinkCount,
  getPortalLabelTextLayout,
} from "./portalLabelLayout";
import {
  didPortalLabelFadeChange,
  isPortalLabelFadeTargetVisible,
  isPortalLabelFadeComplete,
  isPortalLabelFadingOut,
  setPortalLabelTargetVisibility,
  updatePortalLabelFade,
} from "./portalLabelFade";
import { getNonOverlappingPortalLabelGuids } from "./portalLabelOverlap";
import type { PortalLabel, PortalLabelTextLayout } from "./portalLabelTypes";
import {
  PORTAL_LABEL_VISIBILITY_BATCH_DELAY_MS,
  PORTAL_LABEL_VISIBILITY_BATCH_SIZE,
  takePortalLabelGuidBatch,
} from "./portalLabelVisibility";

export class PortalLabelManager {
  private readonly labels: Map<string, PortalLabel> = new Map();
  private readonly labelsPendingCreation: Set<string> = new Set();
  private readonly visibilityQueuedGuids: Set<string> = new Set();
  private readonly fadingLabelGuids: Set<string> = new Set();
  private readonly cameraMoveTracker: PortalLabelCameraMoveTracker;
  private visibilityUpdateScheduled = false;
  private overlapVisibleGuids: Set<string> = new Set();
  private overlapDirty = true;
  private fadeFrame: number | undefined;
  private pendingOverlapRevealGuids: Set<string> | undefined;
  private pendingOverlapRevealGeneration: number | undefined;
  private hasDeferredVisibilityUpdate = false;
  private deferredVisibilityUpdateDepth = 0;
  private overlapRefreshGeneration = 0;
  private hasPositionSettledVisibilityUpdate = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
    private readonly entityPositionManager: EntityPositionManager,
  ) {
    this.cameraMoveTracker = new PortalLabelCameraMoveTracker(
      this.viewer,
      () => this.overlapRefreshGeneration++,
      () => this.queueAllVisibilityUpdates(),
    );
  }

  public async addOrUpdateLabels(portals: PortalData[]): Promise<void> {
    await this.deferVisibilityUpdates(async () => {
      await Promise.all(portals.map((portalData) => this.addOrUpdateLabel(portalData)));
    },);
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
    this.removeLabelPrimitivesInView(viewRect);
  }

  private async updateExistingLabel(label: PortalLabel, data: PortalData): Promise<void> {
    const title = data.title || "";
    const layout = getPortalLabelTextLayout(title);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);
    this.moveLabelToLayer(label, getPortalLabelLayerId(data));
    this.updateLabel(label, layout, entityPosition);
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
      const layout = getPortalLabelTextLayout(title);
      const entityPosition = await this.entityPositionManager.getEntityPosition(data);

      const label: PortalLabel = {
        data,
        primitive: undefined,
        primitiveId: createPortalPrimitiveId(data.guid),
        position: Cesium.Cartesian3.clone(entityPosition.position),
        positionCallback: this.createLabelPositionCallback(data.guid),
        wrappedText: layout.wrappedText,
        screenBoxWidth: layout.screenBoxWidth,
        screenBoxHeight: layout.screenBoxHeight,
        isFallbackPosition: entityPosition.isFallbackPosition,
        currentOpacity: PORTAL_LABEL_INITIAL_OPACITY,
        fadeStartOpacity: PORTAL_LABEL_INITIAL_OPACITY,
        fadeTargetOpacity: PORTAL_LABEL_INITIAL_OPACITY,
        fadeStartTime: 0,
        firstShownAt: undefined,
        linkCount: getPortalLabelLinkCount(data),
        currentLayerId: getPortalLabelLayerId(data),
      };
      this.labels.set(data.guid, label);
      this.entityPositionManager.addPositionChangedCallback(data, label.positionCallback);
      this.queueVisibilityUpdate(data.guid, true);
    } finally {
      this.labelsPendingCreation.delete(data.guid);
    }
  }

  private createLabelPrimitive(
    label: PortalLabel,
    show: boolean,
  ): Cesium.Label {
    return this.layerManager.getOrCreateOverlayLayer(label.currentLayerId).addLabel({
      id: label.primitiveId,
      position: label.position,
      show,
      text: label.wrappedText,
      font: PORTAL_LABEL_FONT,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE.withAlpha(label.currentOpacity),
      outlineColor: Cesium.Color.BLACK.withAlpha(label.currentOpacity),
      outlineWidth: PORTAL_LABEL_OUTLINE_WIDTH,
      showBackground: false,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: PORTAL_LABEL_DISABLE_DEPTH_TEST_DISTANCE,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: createPortalLabelPixelOffset(),
      pixelOffsetScaleByDistance: createPortalLabelPixelOffsetScaleByDistance(),
    },);
  }

  private createLabelPositionCallback(guid: string): EntityPositionCallback {
    return (entityPosition) => {
      const label = this.labels.get(guid);
      if (!label) return;

      const title = label.data.title || "";
      const layout = getPortalLabelTextLayout(title);
      this.updateLabel(label, layout, entityPosition);
      this.queueVisibilityUpdateAfterPositionsSettle();
    };
  }

  private updateLabel(label: PortalLabel, layout: PortalLabelTextLayout, entityPosition: EntityPosition): void {
    Cesium.Cartesian3.clone(entityPosition.position, label.position);
    label.isFallbackPosition = entityPosition.isFallbackPosition;
    if (label.isFallbackPosition) this.setLabelTargetVisibility(label, false);
    if (label.primitive) {
      label.primitive.position = label.position;
      label.primitive.text = layout.wrappedText;
      this.viewer.scene.requestRender();
    }
  }

  private updateLabelPositionSubscription(label: PortalLabel, data: PortalData): void {
    if (label.data.latE6 === data.latE6 && label.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.removePositionChangedCallback(label.data, label.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, label.positionCallback);
  }

  private removeLabel(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (labelInfo) {
      this.removeLabelPrimitive(labelInfo);
      this.entityPositionManager.removePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
      this.labels.delete(guid);
      this.overlapVisibleGuids.delete(guid);
      this.queueAllVisibilityUpdates();
    }
    this.labelsPendingCreation.delete(guid);
    this.visibilityQueuedGuids.delete(guid);
    this.fadingLabelGuids.delete(guid);
  }

  private removeLabelPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.labels.forEach((portalLabel, guid) => {
      const position = portalLabel.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    },);
    if (toRemove.length === 0) return;

    toRemove.forEach((guid) => this.removeLabel(guid));
  }

  private moveLabelToLayer(label: PortalLabel, newLayerId: string): void {
    if (label.currentLayerId === newLayerId) return;

    const show = label.primitive?.show ?? false;
    this.removeLabelPrimitive(label);
    label.currentLayerId = newLayerId;
    if (show) label.primitive = this.createLabelPrimitive(label, true);
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

  private queueVisibilityUpdateAfterPositionsSettle(): void {
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
    },);
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

    const guids = takePortalLabelGuidBatch(this.visibilityQueuedGuids, PORTAL_LABEL_VISIBILITY_BATCH_SIZE);
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
    },);

    if (changed) this.viewer.scene.requestRender();
    if (this.visibilityQueuedGuids.size > 0) this.scheduleVisibilityUpdates(PORTAL_LABEL_VISIBILITY_BATCH_DELAY_MS);
  }

  private async refreshLabelOverlaps(time: Cesium.JulianDate): Promise<boolean> {
    const overlapRefreshGeneration = ++this.overlapRefreshGeneration;
    this.overlapDirty = false;
    this.clearPendingOverlapReveal();

    const nextOverlapVisibleGuids = await getNonOverlappingPortalLabelGuids(
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
      if (isPortalLabelFadingOut(label)) hasLabelsFadingOut = true;
    },);

    return { changed, hasLabelsFadingOut };
  }

  private showAcceptedOverlapLabels(acceptedGuids: Set<string>): boolean {
    let changed = false;

    acceptedGuids.forEach((guid) => {
      const label = this.labels.get(guid);
      if (!label) return;

      this.visibilityQueuedGuids.delete(guid);
      if (this.setLabelTargetVisibility(label, true)) changed = true;
    },);

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
      !isPortalLabelFadeTargetVisible(label);
  }

  private setLabelTargetVisibility(label: PortalLabel, visible: boolean): boolean {
    const shouldShow = visible && !label.isFallbackPosition;
    if (shouldShow) this.ensureLabelPrimitive(label);
    if (!setPortalLabelTargetVisibility(label, shouldShow)) return false;

    this.fadingLabelGuids.add(label.data.guid);
    this.scheduleLabelFade();
    return true;
  }

  private scheduleLabelFade(): void {
    if (this.fadeFrame !== undefined) return;

    this.fadeFrame = window.requestAnimationFrame((timestamp) => {
      this.updateLabelFades(timestamp);
    },);
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

      const result = updatePortalLabelFade(label, timestamp);
      if (didPortalLabelFadeChange(result)) changed = true;
      if (isPortalLabelFadeComplete(result)) {
        this.fadingLabelGuids.delete(guid);
        if (!isPortalLabelFadeTargetVisible(label) && this.removeLabelPrimitive(label)) changed = true;
      }
    },);

    if (!this.hasAnyLabelFadingOut() && this.revealPendingAcceptedOverlapLabels()) changed = true;
    if (changed) this.viewer.scene.requestRender();
    if (this.fadingLabelGuids.size > 0) this.scheduleLabelFade();
  }

  private hasAnyLabelFadingOut(): boolean {
    for (const guid of this.fadingLabelGuids) {
      const label = this.labels.get(guid);
      if (label && isPortalLabelFadingOut(label)) return true;
    }

    return false;
  }

  private ensureLabelPrimitive(label: PortalLabel): void {
    if (label.primitive) return;
    label.primitive = this.createLabelPrimitive(label, true);
  }

  private removeLabelPrimitive(label: PortalLabel): boolean {
    if (!label.primitive) return false;

    const removed = this.layerManager.getOrCreateOverlayLayer(label.currentLayerId).removeLabel(label.primitive);
    label.primitive = undefined;
    return removed;
  }
}

function getPortalLabelLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (data.isPlaceholder === true || level === 0) return `portals-label-placeholder-${team}`;
  else return `portals-label-l${level}-${team}`;
}
