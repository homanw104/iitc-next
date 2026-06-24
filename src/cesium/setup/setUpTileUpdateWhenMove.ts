/**
 * Requests map tiles when the Cesium camera finishes moving.
 */

import type * as Cesium from "cesium";
import type { TileRequestManager } from "../../managers/tiles/tileRequestManager.ts";

export function setUpTileUpdateWhenMove(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  viewer.camera.moveEnd.addEventListener(() => {
    tileRequestManager.requestTilesForCurrentView();
  });
}
