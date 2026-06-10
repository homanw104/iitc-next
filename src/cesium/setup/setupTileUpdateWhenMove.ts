import * as Cesium from "cesium";
import type { TileRequestManager } from "../../managers/tileRequestManager";
import { calculateTileKeys } from "../../utils/viewer";

export function setupTileUpdateWhenMove(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  viewer.camera.moveEnd.addEventListener(() => {
    const tileKeys = calculateTileKeys(viewer);
    if (tileKeys.length > 0) tileRequestManager.addTiles(tileKeys);
  });
}
