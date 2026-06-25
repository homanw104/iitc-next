/**
 * Manages visibility of portal label entities.
 */

import * as Cesium from "cesium";
import { logManager } from "../system/logManager.ts";

export const PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_SIZE = 16;
export const PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS = 10;
export const PORTAL_LABEL_ENTITY_VISIBILITY_EPSILON_METERS = 25;
export const PORTAL_LABEL_ENTITY_VISIBILITY_DISTANCE_EPSILON_FACTOR = 0.02;
export const PORTAL_LABEL_ENTITY_VISIBILITY_MAX_EPSILON_METERS = 300;

const LOG_TAG = "PortalLabelEntityManager";
const RAY_CAST_CALCULATION_HEIGHT_COMPENSATE = 5;

const loggedVisibilityFailures = new Set<string>();
const portalLabelEntityTerrainPickScratch = new Cesium.Cartesian3();
const portalLabelEntityRayTargetScratch = new Cesium.Cartesian3();
const portalLabelEntityRayDirectionScratch = new Cesium.Cartesian3();
const portalLabelEntityVisibilityRayScratch = new Cesium.Ray();

type ScenePickFromRayResult = {
  position?: Cesium.Cartesian3;
};

type SceneWithPickFromRay = Cesium.Scene & {
  pickFromRay?: (ray: Cesium.Ray, objectsToExclude?: object[], width?: number) => ScenePickFromRayResult | undefined;
};

export function isPortalLabelEntityPositionVisible(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
): boolean {
  const globe = viewer.scene.globe;
  const rayTargetPosition = getRayTargetPosition(labelPosition);
  const ray = getCameraToPositionRay(viewer.camera, rayTargetPosition);
  if (!ray) return false;

  if (!globe.show) {
    return isPortalLabelEntityPositionVisibleAgainstRenderedTiles(viewer, rayTargetPosition, ray);
  }

  const terrainPosition = globe.pick(ray, viewer.scene, portalLabelEntityTerrainPickScratch);
  if (!terrainPosition) {
    warnVisibilityFailure("terrain-pick-unavailable", "Label visibility check failed because terrain pick is unavailable.");
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    terrainPosition,
    rayTargetPosition,
  );
}

export function takePortalLabelEntityGuidBatch(queuedGuids: Set<string>, limit: number): string[] {
  const batch: string[] = [];

  for (const guid of queuedGuids) {
    queuedGuids.delete(guid);
    batch.push(guid);
    if (batch.length >= limit) break;
  }

  return batch;
}

function isPortalLabelEntityPositionVisibleAgainstRenderedTiles(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
  ray: Cesium.Ray,
): boolean {
  const tilePosition = pickRenderedTilePosition(viewer.scene, ray);
  if (!tilePosition) {
    warnVisibilityFailure("rendered-tile-pick-unavailable", "Label visibility check failed because rendered 3D tile pick is unavailable.");
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    tilePosition,
    labelPosition,
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
): boolean {
  const pickedDistance = Cesium.Cartesian3.distance(camera.positionWC, pickedPosition);
  const originDistance = Cesium.Cartesian3.distance(camera.positionWC, originPosition);
  const epsilonMeters = getVisibilityEpsilonMeters(originDistance);
  return pickedDistance >= originDistance - epsilonMeters ||
    Cesium.Cartesian3.distance(pickedPosition, originPosition) <= epsilonMeters;
}

function getVisibilityEpsilonMeters(originDistance: number): number {
  return Cesium.Math.clamp(
    originDistance * PORTAL_LABEL_ENTITY_VISIBILITY_DISTANCE_EPSILON_FACTOR,
    PORTAL_LABEL_ENTITY_VISIBILITY_EPSILON_METERS,
    PORTAL_LABEL_ENTITY_VISIBILITY_MAX_EPSILON_METERS,
  );
}

function getCameraToPositionRay(camera: Cesium.Camera, position: Cesium.Cartesian3): Cesium.Ray | undefined {
  const direction = Cesium.Cartesian3.subtract(position, camera.positionWC, portalLabelEntityRayDirectionScratch);
  if (Cesium.Cartesian3.equalsEpsilon(direction, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) {
    warnVisibilityFailure("ray-direction-unavailable", "Label visibility check failed because the label position overlaps the camera.");
    return undefined;
  }

  Cesium.Cartesian3.normalize(direction, direction);
  portalLabelEntityVisibilityRayScratch.origin = camera.positionWC;
  portalLabelEntityVisibilityRayScratch.direction = direction;
  return portalLabelEntityVisibilityRayScratch;
}

function getRayTargetPosition(labelPosition: Cesium.Cartesian3): Cesium.Cartesian3 {
  Cesium.Cartesian3.normalize(labelPosition, portalLabelEntityRayTargetScratch);
  Cesium.Cartesian3.multiplyByScalar(
    portalLabelEntityRayTargetScratch,
    RAY_CAST_CALCULATION_HEIGHT_COMPENSATE,
    portalLabelEntityRayTargetScratch,
  );
  return Cesium.Cartesian3.add(labelPosition, portalLabelEntityRayTargetScratch, portalLabelEntityRayTargetScratch);
}

function warnVisibilityFailure(reason: string, message: string, error?: unknown): void {
  if (loggedVisibilityFailures.has(reason)) return;

  loggedVisibilityFailures.add(reason);
  logManager.warn(LOG_TAG, message, error);
}
