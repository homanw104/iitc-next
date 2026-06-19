/**
 * Handle redeem requests.
 */

import { apiRequest } from "../utils/network";
import { logManager } from "./logManager";

export interface RedeemResponse {
  error?: string;
  result?: string;
}

export class RedeemManager {
  public async requestRedeem(passcode: string): Promise<string> {
    const trimmedPasscode = passcode.trim();
    if (!trimmedPasscode) return "Passcode is required.";

    try {
      const response = (await apiRequest("redeemReward", { passcode: trimmedPasscode })) as RedeemResponse;
      if (response.error) {
        return response.error;
      } else {
        return "Passcode redeemed successfully!";
      }
    } catch (e) {
      logManager.error("GameDetail", "Failed to redeem passcode", JSON.stringify(e));
      return "Failed to redeem passcode.";
    }
  }
}
