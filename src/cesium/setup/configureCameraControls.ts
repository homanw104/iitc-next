/**
 * Configures Cesium camera controls for IITC's custom gesture handling.
 */

import * as Cesium from "cesium";

export function configureCameraControls(viewer: Cesium.Viewer): void {
  const controller = viewer.scene.screenSpaceCameraController;

  // Keep Cesium's mouse-driven tilt/rotate/look controls enabled. Touch pinch is
  // handled by custom gesture handlers, so only default zoom is narrowed to wheel.
  controller.enableTilt = true;
  controller.enableLook = true;
  controller.enableRotate = true;
  controller.zoomEventTypes = [Cesium.CameraEventType.WHEEL];

  // Prefer ellipsoid-based drag handling even near the ground. Cesium's default
  // near-ground terrain pick can fail during main-thread stalls, which makes it
  // fall back to free-look in the middle of a normal left-drag pan.
  controller.minimumPickingTerrainHeight = 0;
  controller.minimumTrackBallHeight = 0;
}
