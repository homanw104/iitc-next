/**
 * Requests map tiles when the Cesium camera finishes moving.
 */

import * as Cesium from "cesium";
import type { TileRequestManager } from "../../managers/tileRequestManager";

export function setUpTileUpdateWhenMove(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  viewer.camera.moveEnd.addEventListener(() => {
    tileRequestManager.requestTilesForCurrentView();
  });
}
