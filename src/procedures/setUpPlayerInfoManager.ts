/**
 * Extract player information from the intel map.
 */

import { playerInfoManager } from "../managers/game/playerInfoManager.ts";
import { logManager } from "../managers/system/logManager";
import type { Team } from "../types/common/common.ts";
import { safeWindow } from "../utils/window.ts";

const LOG_TAG = "SetUpPlayerInfoManager";

type IntelPlayer = {
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

type WindowWithIntelPlayer = Window & typeof globalThis & {
  PLAYER?: IntelPlayer;
};

declare global {
  interface Window {
    // Exposed by the original intel map
    PLAYER?: IntelPlayer;
  }
}

export default function setUpPlayerInfoManager() {
  const targetWindow = safeWindow as WindowWithIntelPlayer;
  const player = targetWindow.PLAYER;

  if (!player || !player.nickname) {
    if (document.getElementById("header_email")) {
      // Ingress Intel page seems to be in a weird state, it has email but no player data
      logManager.error(LOG_TAG, "Logged in but page doesn't have player data");
    }
  } else {
    playerInfoManager.setPlayerInfo({
      ap: player.ap,
      availableInvites: player.available_invites,
      energy: player.energy,
      minApForCurrentLevel: player.min_ap_for_current_level,
      minApForNextLevel: player.min_ap_for_next_level,
      nickname: player.nickname,
      team: player.team,
      verifiedLevel: player.verified_level,
      xmCapacity: player.xm_capacity,
    });
  }

  if (safeWindow) safeWindow.iitc.playerInfoManager = playerInfoManager;
}
