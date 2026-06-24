/**
 * Functions to manage player info.
 */

import type { Player } from "../../types/ingress.ts";
import { logManager } from "../system/logManager.ts";

const LOG_TAG = "PlayerInfoManager";

export class PlayerInfoManager {
  private player: Player | undefined;

  public setPlayerInfo(player: Player): void {
    logManager.debug(LOG_TAG, "Setting player info");
    this.player = player;
  }

  public getPlayerInfo(): Player | undefined {
    return this.player;
  }
}

export const playerInfoManager = new PlayerInfoManager();
