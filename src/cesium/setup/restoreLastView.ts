/**
 * Restores the camera position from Intel map state.
 */

import * as Cesium from "cesium";
import { HEIGHT_AT_ZOOM_ZERO } from "../../managers/tiles/tileRequestMath";
import { getMapPosition } from "../../utils/browser";

export function restoreLastView(viewer: Cesium.Viewer): Cesium.Cartographic | undefined {
  const restoredPosition = getRestoredCameraPosition();
  if (!restoredPosition) return undefined;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      restoredPosition.longitude,
      restoredPosition.latitude,
      restoredPosition.height,
    ),
  });
  return restoredPosition;
}

function getRestoredCameraPosition(): Cesium.Cartographic | undefined {
  const position = getMapPosition();
  if (!position) return undefined;

  const height = HEIGHT_AT_ZOOM_ZERO / Math.pow(2, position.zoom);
  return Cesium.Cartographic.fromDegrees(position.lng, position.lat, height);
}
