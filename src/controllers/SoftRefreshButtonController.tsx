import { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";

export class SoftRefreshButtonController {
  private readonly tileRequestManager: TileRequestManager;

  constructor(tileRequestManager: TileRequestManager) {
    this.tileRequestManager = tileRequestManager;
  }

  public refreshView() {
    this.tileRequestManager.refreshView();
  }
}
