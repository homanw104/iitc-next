/**
 * Handle redeem requests.
 */

import type { RedeemPlayerData, RedeemResponse } from "../../types/api/redeemReward.ts";
import { apiRequestManager } from "../system/apiRequestManager.ts";
import { playerInfoManager } from "./playerInfoManager.ts";
import { logManager } from "../system/logManager";

const LOG_TAG = "RedeemManager";

export type RedeemResult =
  | { ok: true; response: RedeemResponse }
  | { ok: false; message: string };

export class RedeemManager {
  public async requestRedeem(passcode: string): Promise<RedeemResult> {
    const trimmedPasscode = passcode.trim();
    if (!trimmedPasscode) return { ok: false, message: "Passcode is required." };

    try {
      const response = await apiRequestManager.redeemReward(trimmedPasscode);

      if (response.error) {
        return { ok: false, message: stringifyError(response.error) };
      }

      if (!response.rewards) {
        return { ok: false, message: "An unexpected error occurred." };
      }

      if (response.playerData) {
        updatePlayerInfo(response.playerData);
      }

      return { ok: true, response };
    } catch (e) {
      logManager.error(LOG_TAG, "Failed to redeem passcode", stringifyError(e));
      return { ok: false, message: "Failed to redeem passcode." };
    }
  }
}

function updatePlayerInfo(player: RedeemPlayerData): void {
  playerInfoManager.setPlayerInfo({
    ap: player.ap,
    availableInvites: player.available_invites,
    energy: player.energy,
    minApForCurrentLevel: Number(player.min_ap_for_current_level),
    minApForNextLevel: Number(player.min_ap_for_next_level),
    nickname: player.nickname,
    team: player.team,
    verifiedLevel: player.verified_level,
    xmCapacity: player.xm_capacity,
  });
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
