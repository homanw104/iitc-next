/**
 * Extract player information from the intel map.
 */

import { Team } from "../types/ingress";
import { logManager } from "../managers/logManager";
import { playerInfoManager } from "../managers/playerInfoManager.ts";
import { safeWindow } from "../utils/window.ts";

declare global {
  interface Window {
    // Exposed by the original intel map
    PLAYER?: {
      ap: string;
      available_invites: number;
      energy: number;
      min_ap_for_current_level: number;
      min_ap_for_next_level: number;
      nickname: string;
      team: Team;
      verified_level: number;
      xm_capacity: string;
    };
  }
}

export default function setUpPlayerInfoManager() {
  if (!window.PLAYER || !window.PLAYER.nickname) {
    logManager.warn("User not logged in. Initialization will be skipped");

    if (document.getElementById("header_email")) {
      // Ingress Intel page seems to be in a weird state, it has email but no player data
      logManager.error("Logged in but page doesn't have player data");
    }
  } else {
    playerInfoManager.setPlayerInfo({
      ap: window.PLAYER.ap,
      availableInvites: window.PLAYER.available_invites,
      energy: window.PLAYER.energy,
      minApForCurrentLevel: window.PLAYER.min_ap_for_current_level,
      minApForNextLevel: window.PLAYER.min_ap_for_next_level,
      nickname: window.PLAYER.nickname,
      team: window.PLAYER.team,
      verifiedLevel: window.PLAYER.verified_level,
      xmCapacity: window.PLAYER.xm_capacity,
    });
  }

  if (safeWindow) safeWindow.iitc.playerInfoManager = playerInfoManager;
}
