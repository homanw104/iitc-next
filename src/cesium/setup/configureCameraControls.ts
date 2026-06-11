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
}
