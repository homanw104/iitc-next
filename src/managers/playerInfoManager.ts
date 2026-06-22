/**
 * Functions to manage player info.
 */

import { Player } from "../types/ingress.ts";
import { logManager } from "./logManager.ts";

export class PlayerInfoManager {
  private player: Player | undefined;

  public setPlayerInfo(player: Player): void {
    logManager.debug("PlayerInfo", "Setting player info");
    this.player = player;
  }

  public getPlayerInfo(): Player | undefined {
    return this.player;
  }
}

export const playerInfoManager = new PlayerInfoManager();
