import { playerInfoManager } from "../managers/playerInfoManager.ts";

export default function getLoginStatus(): boolean {
  return playerInfoManager.getPlayerInfo() !== undefined;
}
