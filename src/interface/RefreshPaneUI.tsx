import * as Cesium from "cesium";
import { TileRequestManager } from "../managers/tileRequestManager";
import { calculateTileKeys } from "../utils/viewer";

export class RefreshPaneUI {
  private readonly viewer: Cesium.Viewer;
  private readonly tileRequestManager: TileRequestManager;

  constructor(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager) {
    this.viewer = viewer;
    this.tileRequestManager = tileRequestManager;
  }

  public refreshView() {
    const tileKeys = calculateTileKeys(this.viewer);

    if (tileKeys.length > 0) {
      this.tileRequestManager.removeTiles(tileKeys);
      this.tileRequestManager.addTiles(tileKeys, true);
    }
  }
}
