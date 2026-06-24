/**
 * Manage portal label entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { LayerManager } from "./layerManager";
import { logManager } from "./logManager.ts";
import { wrapLabelText } from "../utils/text.ts";

const LABEL_FONT_SIZE_PX = 12;
const LABEL_LINE_HEIGHT_PX = 14;
const LABEL_FONT_FAMILY = "sans-serif";
const LABEL_FONT = `${LABEL_FONT_SIZE_PX}px/${LABEL_LINE_HEIGHT_PX}px ${LABEL_FONT_FAMILY}`;
const LABEL_MAX_LINE_LENGTH = 24;
const LABEL_AVERAGE_CHARACTER_WIDTH_PX = 7;
const LABEL_OUTLINE_WIDTH = 8;
const LABEL_PIXEL_OFFSET_Y = -16;
const LABEL_DISABLE_DEPTH_TEST_DISTANCE = Number.POSITIVE_INFINITY;

const LABEL_INITIAL_OPACITY = 0;
const LABEL_VISIBLE_OPACITY = 1;
const LABEL_HIDDEN_OPACITY = 0;
const LABEL_FADE_DURATION_MS = 200;

const LABEL_OVERLAP_PADDING_PX = 32;
const LABEL_VISIBILITY_EPSILON_METERS = 25;
const LABEL_GOOGLE_VISIBILITY_TEST_HEIGHT_METERS = 100;

const LABEL_CAMERA_MOVE_VISIBILITY_UPDATE_INTERVAL_MS = 3000;
const LABEL_CAMERA_MOVE_MIN_POSITION_METERS = 5;
const LABEL_CAMERA_MOVE_HEIGHT_FACTOR = 0.01;
const LABEL_CAMERA_MOVE_MIN_ANGLE_RADIANS = Cesium.Math.toRadians(0.5);

const LABEL_VISIBILITY_BATCH_SIZE = 16;
const LABEL_VISIBILITY_BATCH_DELAY_MS = 10;

const LOG_TAG = "PortalLabelEntityManager";

const loggedVisibilityFailures = new Set<string>();
const labelTerrainPickScratch = new Cesium.Cartesian3();
const labelRayDirectionScratch = new Cesium.Cartesian3();
const labelVisibilityRayScratch = new Cesium.Ray();
const labelVisibilityNormalScratch = new Cesium.Cartesian3();
const labelVisibilityPositionScratch = new Cesium.Cartesian3();
const labelWindowPositionScratch = new Cesium.Cartesian2();
const labelCameraCartographicScratch = new Cesium.Cartographic();

interface LabelScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LabelOverlapCandidate {
  guid: string;
  bounds: LabelScreenBounds;
  distance: number;
}

type EllipsoidalOccluder = {
  cameraPosition: Cesium.Cartesian3;
  isPointVisible: (occludee: Cesium.Cartesian3) => boolean;
};

type CesiumWithEllipsoidalOccluder = typeof Cesium & {
  EllipsoidalOccluder: new (ellipsoid: Cesium.Ellipsoid, cameraPosition?: Cesium.Cartesian3) => EllipsoidalOccluder;
};

type ScenePickFromRayResult = {
  position?: Cesium.Cartesian3;
};

type SceneWithPickFromRay = Cesium.Scene & {
  pickFromRay?: (ray: Cesium.Ray, objectsToExclude?: object[], width?: number) => ScenePickFromRayResult | undefined;
};

let globeOccluder: EllipsoidalOccluder | undefined;

interface Label {
  data: PortalData;
  entity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
  opacity: number;
  targetOpacity: number;
  fadeStartOpacity: number;
  fadeStartTime: number;
}

export class PortalLabelEntityManager {
  private labels: Map<string, Label> = new Map();
  private labelsPendingCreation: Set<string> = new Set();
  private visibilityQueuedGuids: Set<string> = new Set();
  private visibilityUpdateScheduled = false;
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
      this.queueAllVisibilityUpdates();
    });
  }

  public async addOrUpdateLabel(data: PortalData): Promise<void> {
    if (!data.title) {
      this.removeLabel(data.guid);
      return;
    }

    const existing = this.labels.get(data.guid);
    if (existing) {
      const oldLayerId = getPortalLabelLayerId(existing.data);
      const newLayerId = getPortalLabelLayerId(data);
      if (oldLayerId !== newLayerId) {
        this.layerManager.getOrCreateOverlay(oldLayerId).entities.remove(existing.entity);
        this.layerManager.getOrCreateOverlay(newLayerId).entities.add(existing.entity);
      }
      await this.updateLabelEntity(existing.entity, data);
      this.updateLabelPositionSubscription(existing, data);
      this.queueAllVisibilityUpdates();
      existing.data = data;
    } else {
      if (this.labelsPendingCreation.has(data.guid)) return;
      this.labelsPendingCreation.add(data.guid);
      try {
        const entity = await this.createLabelEntity(data);
        const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
          entity.position = new Cesium.ConstantPositionProperty(position);
          this.queueAllVisibilityUpdates();
        };
        this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
        const label: Label = {
          data,
          entity,
          positionCallback,
          opacity: LABEL_INITIAL_OPACITY,
          targetOpacity: LABEL_INITIAL_OPACITY,
          fadeStartOpacity: LABEL_INITIAL_OPACITY,
          fadeStartTime: 0,
        };
        setLabelColorCallbackProperties(label);
        this.queueVisibilityUpdate(data.guid, true);
        this.labels.set(data.guid, label);
      } finally {
        this.labelsPendingCreation.delete(data.guid);
      }
    }
  }

  public removeLabel(guid: string): void {
    this.removeLabelEntity(guid);
  }

  public removeLabelsInView(viewRect: Cesium.Rectangle): void {
    this.removeLabelEntitiesInView(viewRect);
  }

  private async createLabelEntity(data: PortalData): Promise<Cesium.Entity> {
    const layerId = getPortalLabelLayerId(data);
    const entities = this.layerManager.getOrCreateOverlay(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    return entities.add({
      id: `label-${data.guid}`,
      position: position,
      show: false,
      label: {
        text: wrapLabelText(data.title || "", LABEL_MAX_LINE_LENGTH),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE.withAlpha(LABEL_INITIAL_OPACITY),
        outlineColor: Cesium.Color.BLACK.withAlpha(LABEL_INITIAL_OPACITY),
        outlineWidth: LABEL_OUTLINE_WIDTH,
        showBackground: false,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: LABEL_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, LABEL_PIXEL_OFFSET_Y),
      },
      properties: {
        selectable: false,
      },
    });
  }

  private async updateLabelEntity(entity: Cesium.Entity, data: PortalData): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);

    entity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(wrapLabelText(data.title || "", LABEL_MAX_LINE_LENGTH));
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
      const layerId = getPortalLabelLayerId(labelInfo.data);
      const entities = this.layerManager.getOrCreateOverlay(layerId).entities;

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
    this.labels.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    toRemove.forEach(guid => this.removeLabelEntity(guid));
  }

  private queueAllVisibilityUpdates(): void {
    this.captureVisibilityCameraSnapshot();
    this.overlapDirty = true;
    this.labels.forEach((_label, guid) => this.visibilityQueuedGuids.add(guid));
    this.scheduleVisibilityUpdates();
  }

  private queueVisibilityUpdate(guid: string, overlapDirty = false): void {
    if (overlapDirty) this.overlapDirty = true;
    this.visibilityQueuedGuids.add(guid);
    this.scheduleVisibilityUpdates();
  }

  private scheduleVisibilityUpdates(delayMs = 0): void {
    if (this.visibilityUpdateScheduled) return;

    this.visibilityUpdateScheduled = true;
    window.setTimeout(() => this.flushVisibilityQueue(), delayMs);
  }

  private flushVisibilityQueue(): void {
    this.visibilityUpdateScheduled = false;

    let changed = false;
    if (this.overlapDirty) changed = this.refreshLabelOverlaps();

    const guids = takeGuidBatch(this.visibilityQueuedGuids, LABEL_VISIBILITY_BATCH_SIZE);
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

      const labelPosition = label.entity.position?.getValue();
      if (!labelPosition) {
        if (this.setLabelTargetVisibility(label, false)) changed = true;
        return;
      }

      const visible = isLabelPositionVisible(this.viewer, labelPosition);
      if (this.setLabelTargetVisibility(label, visible)) changed = true;
    });

    if (changed) this.viewer.scene.requestRender();
    if (this.visibilityQueuedGuids.size > 0) this.scheduleVisibilityUpdates(LABEL_VISIBILITY_BATCH_DELAY_MS);
  }

  private refreshLabelOverlaps(): boolean {
    this.overlapDirty = false;
    this.overlapVisibleGuids = getNonOverlappingLabelGuids(this.viewer, this.labels);

    let changed = false;
    this.labels.forEach((label, guid) => {
      if (this.overlapVisibleGuids.has(guid)) {
        this.visibilityQueuedGuids.add(guid);
        return;
      }

      this.visibilityQueuedGuids.delete(guid);
      if (this.setLabelTargetVisibility(label, false)) changed = true;
    });
    return changed;
  }

  private setLabelTargetVisibility(label: Label, visible: boolean): boolean {
    const targetOpacity = visible ? LABEL_VISIBLE_OPACITY : LABEL_HIDDEN_OPACITY;
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
      if (setLabelOpacity(label, opacity)) changed = true;

      if (progress < 1) return;

      setLabelOpacity(label, label.targetOpacity);
      if (label.targetOpacity === LABEL_HIDDEN_OPACITY && label.entity.show) {
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

function getPortalLabelLayerId(data: PortalData): string {
  return `portals-label-${data.team.toLowerCase()}`;
}

function getNonOverlappingLabelGuids(
  viewer: Cesium.Viewer,
  labels: Map<string, Label>,
): Set<string> {
  const candidates: LabelOverlapCandidate[] = [];

  labels.forEach((label, guid) => {
    const labelPosition = label.entity.position?.getValue();
    if (!labelPosition) return;

    const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      labelPosition,
      labelWindowPositionScratch,
    );
    if (!windowPosition) return;

    const bounds = getLabelScreenBounds(label.data.title || "", windowPosition);
    if (!isLabelScreenBoundsInCanvas(bounds, viewer.scene.canvas)) return;

    candidates.push({
      guid,
      bounds,
      distance: Cesium.Cartesian3.distance(viewer.camera.positionWC, labelPosition),
    });
  });

  candidates.sort((a, b) => a.distance - b.distance || a.guid.localeCompare(b.guid));

  const acceptedGuids = new Set<string>();
  const acceptedBounds: LabelScreenBounds[] = [];
  candidates.forEach((candidate) => {
    if (acceptedBounds.some((bounds) => doScreenBoundsOverlap(bounds, candidate.bounds))) return;

    acceptedGuids.add(candidate.guid);
    acceptedBounds.push(candidate.bounds);
  });
  return acceptedGuids;
}

function getLabelScreenBounds(text: string, windowPosition: Cesium.Cartesian2): LabelScreenBounds {
  const lines = wrapLabelText(text, LABEL_MAX_LINE_LENGTH).split("\n");
  const maxLineLength = lines.reduce((maxLength, line) => Math.max(maxLength, line.length), 0);
  const width = maxLineLength * LABEL_AVERAGE_CHARACTER_WIDTH_PX + LABEL_OUTLINE_WIDTH * 2;
  const height = lines.length * LABEL_LINE_HEIGHT_PX + LABEL_OUTLINE_WIDTH * 2;
  const anchorY = windowPosition.y + LABEL_PIXEL_OFFSET_Y;

  return {
    left: windowPosition.x - width / 2 - LABEL_OVERLAP_PADDING_PX,
    top: anchorY - height - LABEL_OVERLAP_PADDING_PX,
    right: windowPosition.x + width / 2 + LABEL_OVERLAP_PADDING_PX,
    bottom: anchorY + LABEL_OVERLAP_PADDING_PX,
  };
}

function isLabelScreenBoundsInCanvas(bounds: LabelScreenBounds, canvas: HTMLCanvasElement): boolean {
  return bounds.right >= 0 &&
    bounds.left <= canvas.clientWidth &&
    bounds.bottom >= 0 &&
    bounds.top <= canvas.clientHeight;
}

function doScreenBoundsOverlap(a: LabelScreenBounds, b: LabelScreenBounds): boolean {
  return a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
}

function setLabelColorCallbackProperties(label: Label): void {
  if (!label.entity.label) return;

  label.entity.label.fillColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.WHITE.withAlpha(label.opacity, result), false);
  label.entity.label.outlineColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.BLACK.withAlpha(label.opacity, result), false);
}

function setLabelOpacity(label: Label, opacity: number): boolean {
  const clampedOpacity = Cesium.Math.clamp(opacity, LABEL_HIDDEN_OPACITY, LABEL_VISIBLE_OPACITY);
  if (Math.abs(label.opacity - clampedOpacity) < Cesium.Math.EPSILON6) return false;

  label.opacity = clampedOpacity;
  return true;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function isLabelPositionVisible(viewer: Cesium.Viewer, labelPosition: Cesium.Cartesian3): boolean {
  const globe = viewer.scene.globe;
  const ray = getCameraToPositionRay(viewer.camera, labelPosition);
  if (!ray) return false;

  if (!globe.show) {
    return isLabelPositionVisibleAgainstRenderedTiles(viewer, labelPosition, ray);
  }

  const terrainPosition = globe.pick(ray, viewer.scene, labelTerrainPickScratch);
  if (!terrainPosition) {
    warnVisibilityFailure("terrain-pick-unavailable", "Label visibility check failed because terrain pick is unavailable.");
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    terrainPosition,
    labelPosition,
    LABEL_VISIBILITY_EPSILON_METERS,
  );
}

function isLabelPositionVisibleAgainstRenderedTiles(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
  ray: Cesium.Ray,
): boolean {
  if (!isLabelPositionVisibleAgainstHorizon(viewer, labelPosition)) return false;

  const tilePosition = pickRenderedTilePosition(viewer.scene, ray);
  if (!tilePosition) {
    warnVisibilityFailure("rendered-tile-pick-unavailable", "Label visibility check failed because rendered 3D tile pick is unavailable.");
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    tilePosition,
    labelPosition,
    LABEL_VISIBILITY_EPSILON_METERS,
  );
}

function pickRenderedTilePosition(scene: Cesium.Scene, ray: Cesium.Ray): Cesium.Cartesian3 | undefined {
  const sceneWithPickFromRay = scene as SceneWithPickFromRay;
  if (!sceneWithPickFromRay.pickFromRay) {
    warnVisibilityFailure("rendered-tile-pick-unavailable", "Label visibility check failed because rendered 3D tile pick is unavailable.");
    return undefined;
  }

  try {
    return sceneWithPickFromRay.pickFromRay(ray)?.position;
  } catch (error) {
    warnVisibilityFailure("rendered-tile-pick-error", "Label visibility check failed while picking rendered 3D tiles.", error);
    return undefined;
  }
}

function isPickedPositionVisible(
  camera: Cesium.Camera,
  pickedPosition: Cesium.Cartesian3,
  originPosition: Cesium.Cartesian3,
  epsilonMeters: number,
): boolean {
  const pickedDistance = Cesium.Cartesian3.distance(camera.positionWC, pickedPosition);
  const originDistance = Cesium.Cartesian3.distance(camera.positionWC, originPosition);
  return pickedDistance >= originDistance - epsilonMeters ||
    Cesium.Cartesian3.distance(pickedPosition, originPosition) <= epsilonMeters;
}

function getCameraToPositionRay(camera: Cesium.Camera, position: Cesium.Cartesian3): Cesium.Ray | undefined {
  const direction = Cesium.Cartesian3.subtract(position, camera.positionWC, labelRayDirectionScratch);
  if (Cesium.Cartesian3.equalsEpsilon(direction, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) {
    warnVisibilityFailure("ray-direction-unavailable", "Label visibility check failed because the label position overlaps the camera.");
    return undefined;
  }

  Cesium.Cartesian3.normalize(direction, direction);
  labelVisibilityRayScratch.origin = camera.positionWC;
  labelVisibilityRayScratch.direction = direction;
  return labelVisibilityRayScratch;
}

function isLabelPositionVisibleAgainstHorizon(viewer: Cesium.Viewer, labelPosition: Cesium.Cartesian3): boolean {
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const visibilityPosition = getRaisedVisibilityPosition(ellipsoid, labelPosition);
  const EllipsoidalOccluderConstructor = (Cesium as CesiumWithEllipsoidalOccluder).EllipsoidalOccluder;

  if (!globeOccluder) {
    globeOccluder = new EllipsoidalOccluderConstructor(ellipsoid, viewer.camera.positionWC);
  } else {
    globeOccluder.cameraPosition = viewer.camera.positionWC;
  }
  return globeOccluder.isPointVisible(visibilityPosition);
}

function getRaisedVisibilityPosition(ellipsoid: Cesium.Ellipsoid, position: Cesium.Cartesian3): Cesium.Cartesian3 {
  const normal = ellipsoid.geodeticSurfaceNormal(position, labelVisibilityNormalScratch);
  return Cesium.Cartesian3.add(
    position,
    Cesium.Cartesian3.multiplyByScalar(normal, LABEL_GOOGLE_VISIBILITY_TEST_HEIGHT_METERS, labelVisibilityPositionScratch),
    labelVisibilityPositionScratch,
  );
}

function warnVisibilityFailure(reason: string, message: string, error?: unknown): void {
  if (loggedVisibilityFailures.has(reason)) return;

  loggedVisibilityFailures.add(reason);
  logManager.warn(LOG_TAG, message, error);
}

function takeGuidBatch(queuedGuids: Set<string>, limit: number): string[] {
  const batch: string[] = [];

  for (const guid of queuedGuids) {
    queuedGuids.delete(guid);
    batch.push(guid);
    if (batch.length >= limit) break;
  }

  return batch;
}
