/**
 * Class to manage player info
 */

import { Player } from "../types/ingress";
import { logManager } from "../managers/logManager";

let player: Player | undefined;

/**
 * Set playerInfo to be used in the app.
 *
 * @param playerInfo - Formatted player info object.
 */
export function setPlayerInfo(playerInfo: Player) {
  logManager.debug("PlayerInfo", "Setting player info", playerInfo);
  player = playerInfo;
}

/**
 * Get player info.
 */
export function getPlayerInfo() {
  return player;
}
