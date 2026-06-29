/**
 * Checks whether a portal label anchor is visible from the camera.
 *
 * Labels render as overlays, so overlap acceptance still needs an occlusion
 * check against the world. With globe terrain enabled, we ray-cast against the
 * globe; without it, we fall back to rendered-depth picking. The checked point
 * is nudged slightly above the portal anchor to avoid treating the portal's own
 * surface as an occluder.
 */

import * as Cesium from "cesium";
import { logManager } from "../system/logManager.ts";

export const PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_SIZE = 16;
export const PORTAL_LABEL_ENTITY_VISIBILITY_BATCH_DELAY_MS = 10;
export const PORTAL_LABEL_ENTITY_VISIBILITY_EPSILON_METERS = 25;
export const PORTAL_LABEL_ENTITY_VISIBILITY_DISTANCE_EPSILON_FACTOR = 0.02;
export const PORTAL_LABEL_ENTITY_VISIBILITY_MAX_EPSILON_METERS = 300;

const LOG_TAG = "PortalLabelEntityManager";
const RAY_TARGET_HEIGHT_OFFSET_METERS = 5;

const loggedVisibilityFailures = new Set<string>();
const terrainPickScratch = new Cesium.Cartesian3();
const renderedDepthPickScratch = new Cesium.Cartesian3();
const rayTargetScratch = new Cesium.Cartesian3();
const rayDirectionScratch = new Cesium.Cartesian3();
const visibilityRayScratch = new Cesium.Ray();

export function isPortalLabelEntityPositionVisible(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
  windowPosition?: Cesium.Cartesian2,
): boolean {
  const targetPosition = getVisibilityTargetPosition(labelPosition);

  if (!viewer.scene.globe.show) {
    if (!windowPosition) {
      warnVisibilityFailure(
        "rendered-depth-position-unavailable",
        "Label visibility check failed because the label window position is unavailable.",
      );
      return false;
    }

    return isPositionVisibleAgainstRenderedDepth(viewer, targetPosition, windowPosition);
  }

  return isPositionVisibleAgainstTerrain(viewer, targetPosition);
}

function isPositionVisibleAgainstTerrain(
  viewer: Cesium.Viewer,
  targetPosition: Cesium.Cartesian3,
): boolean {
  const ray = getCameraToPositionRay(viewer.camera, targetPosition);
  if (!ray) return false;

  const terrainPosition = viewer.scene.globe.pick(ray, viewer.scene, terrainPickScratch);
  if (!terrainPosition) {
    warnVisibilityFailure("terrain-pick-unavailable", "Label visibility check failed because terrain pick is unavailable.");
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    terrainPosition,
    targetPosition,
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

function isPositionVisibleAgainstRenderedDepth(
  viewer: Cesium.Viewer,
  targetPosition: Cesium.Cartesian3,
  windowPosition: Cesium.Cartesian2,
): boolean {
  const depthPosition = pickRenderedDepthPosition(viewer.scene, windowPosition);
  if (!depthPosition) {
    warnVisibilityFailure(
      "rendered-depth-pick-unavailable",
      "Label visibility check failed because rendered depth pick is unavailable.",
    );
    return false;
  }

  return isPickedPositionVisible(
    viewer.camera,
    depthPosition,
    targetPosition,
  );
}

function pickRenderedDepthPosition(scene: Cesium.Scene, windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
  if (!scene.pickPositionSupported) {
    warnVisibilityFailure("rendered-depth-pick-unavailable", "Label visibility check failed because rendered depth pick is unavailable.");
    return undefined;
  }

  try {
    return scene.pickPosition(windowPosition, renderedDepthPickScratch);
  } catch (error) {
    warnVisibilityFailure("rendered-depth-pick-error", "Label visibility check failed while picking rendered depth.", error);
    return undefined;
  }
}

function isPickedPositionVisible(
  camera: Cesium.Camera,
  pickedPosition: Cesium.Cartesian3,
  targetPosition: Cesium.Cartesian3,
): boolean {
  const pickedDistance = Cesium.Cartesian3.distance(camera.positionWC, pickedPosition);
  const targetDistance = Cesium.Cartesian3.distance(camera.positionWC, targetPosition);
  const epsilonMeters = getVisibilityEpsilonMeters(targetDistance);
  return pickedDistance >= targetDistance - epsilonMeters ||
    Cesium.Cartesian3.distance(pickedPosition, targetPosition) <= epsilonMeters;
}

function getVisibilityEpsilonMeters(targetDistance: number): number {
  return Cesium.Math.clamp(
    targetDistance * PORTAL_LABEL_ENTITY_VISIBILITY_DISTANCE_EPSILON_FACTOR,
    PORTAL_LABEL_ENTITY_VISIBILITY_EPSILON_METERS,
    PORTAL_LABEL_ENTITY_VISIBILITY_MAX_EPSILON_METERS,
  );
}

function getCameraToPositionRay(camera: Cesium.Camera, position: Cesium.Cartesian3): Cesium.Ray | undefined {
  const direction = Cesium.Cartesian3.subtract(position, camera.positionWC, rayDirectionScratch);
  if (Cesium.Cartesian3.equalsEpsilon(direction, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) {
    warnVisibilityFailure("ray-direction-unavailable", "Label visibility check failed because the label position overlaps the camera.");
    return undefined;
  }

  Cesium.Cartesian3.normalize(direction, direction);
  visibilityRayScratch.origin = camera.positionWC;
  visibilityRayScratch.direction = direction;
  return visibilityRayScratch;
}

function getVisibilityTargetPosition(labelPosition: Cesium.Cartesian3): Cesium.Cartesian3 {
  Cesium.Cartesian3.normalize(labelPosition, rayTargetScratch);
  Cesium.Cartesian3.multiplyByScalar(
    rayTargetScratch,
    RAY_TARGET_HEIGHT_OFFSET_METERS,
    rayTargetScratch,
  );
  return Cesium.Cartesian3.add(labelPosition, rayTargetScratch, rayTargetScratch);
}

function warnVisibilityFailure(reason: string, message: string, error?: unknown): void {
  if (loggedVisibilityFailures.has(reason)) return;

  loggedVisibilityFailures.add(reason);
  logManager.warn(LOG_TAG, message, error);
}
