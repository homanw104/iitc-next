import { TileRequestManager } from "../managers/tileRequestManager";

export class SoftRefreshButtonController {
  private readonly tileRequestManager: TileRequestManager;

  constructor(tileRequestManager: TileRequestManager) {
    this.tileRequestManager = tileRequestManager;
  }

  public refreshView() {
    this.tileRequestManager.refreshView();
  }
}
