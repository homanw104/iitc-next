/**
 * Raises the restored camera when it's too close to the ground.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entity/entityPositionManager.ts";

const MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS = 200;

export function keepRestoredCameraAboveTerrain(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
  restoredPosition: Cesium.Cartographic | undefined,
): void {
  if (!restoredPosition) return;

  raiseRestoredCameraAboveTerrain(viewer, entityPositionManager, restoredPosition).then();
}

async function raiseRestoredCameraAboveTerrain(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
  restoredPosition: Cesium.Cartographic,
): Promise<void> {
  const surfaceHeight = await getSurfaceHeight(entityPositionManager, restoredPosition);
  if (surfaceHeight === undefined || hasCameraMoved(viewer.camera, restoredPosition)) return;

  const minimumHeight = surfaceHeight + MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS;
  if (restoredPosition.height >= minimumHeight) return;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      restoredPosition.longitude,
      restoredPosition.latitude,
      minimumHeight,
    ),
  });
  viewer.scene.requestRender();
}

async function getSurfaceHeight(
  entityPositionManager: EntityPositionManager,
  restoredPosition: Cesium.Cartographic,
): Promise<number | undefined> {
  const entityPosition = await entityPositionManager.getEntityPosition({
    latE6: Math.round(Cesium.Math.toDegrees(restoredPosition.latitude) * 1e6),
    lngE6: Math.round(Cesium.Math.toDegrees(restoredPosition.longitude) * 1e6),
  });

  await new Promise<void>((resolve) => {
    entityPositionManager.runAfterSamplingWork(resolve);
  });

  if (entityPosition.isFallbackPosition) {
    return undefined;
  } else {
    return getFiniteHeight(Cesium.Cartographic.fromCartesian(entityPosition.position).height);
  }
}

function getFiniteHeight(height: number | undefined): number | undefined {
  return height !== undefined && Number.isFinite(height) ? height : undefined;
}

function hasCameraMoved(camera: Cesium.Camera, restoredPosition: Cesium.Cartographic): boolean {
  const currentPosition = camera.positionCartographic;
  const hasLngMoved = !Cesium.Math.equalsEpsilon(currentPosition.longitude, restoredPosition.longitude, Cesium.Math.EPSILON10);
  const hasLatMoved = !Cesium.Math.equalsEpsilon(currentPosition.latitude, restoredPosition.latitude, Cesium.Math.EPSILON10);
  const hasHeightMoved = Math.abs(currentPosition.height - restoredPosition.height) > 1;
  return hasLngMoved || hasLatMoved || hasHeightMoved;
}
