/**
 * Configures Cesium camera controls for IITC's custom gesture handling.
 */

import * as Cesium from "cesium";

export function configureCameraControls(viewer: Cesium.Viewer): void {
  // Disable default pinch tilt and rotate
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;

  // Keep mouse wheel zoom while using custom pinch zoom handling.
  viewer.scene.screenSpaceCameraController.zoomEventTypes = [Cesium.CameraEventType.WHEEL];
}
