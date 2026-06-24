/**
 * Tell whether a user is logged in.
 */

import { playerInfoManager } from "../managers/game/playerInfoManager.ts";

export default function getLoginStatus(): boolean {
  return playerInfoManager.getPlayerInfo() !== undefined;
}
