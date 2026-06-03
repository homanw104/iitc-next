/**
 * Handle redeem requests.
 */

import { apiRequest } from "../utils/network";
import { logManager } from "./logManager";

export class RedeemManager {
  public async requestRedeem(passcode: string) {
    if (!passcode) return;
    try {
      const response = (await apiRequest("redeemReward", { passcode })) as any;
      if (response.error) {
        return response.error;
      } else {
        return "Passcode redeemed successfully!";
      }
    } catch (e) {
      logManager.error("GameDetail", "Failed to redeem passcode", e);
      return "Failed to redeem passcode.";
    }
  }
}
