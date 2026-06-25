/**
 * Handle redeem requests.
 */

import { intelApiClient } from "../../utils/api.ts";
import { logManager } from "../system/logManager";

const LOG_TAG = "RedeemManager";

export class RedeemManager {
  public async requestRedeem(passcode: string): Promise<string> {
    const trimmedPasscode = passcode.trim();
    if (!trimmedPasscode) return "Passcode is required.";

    try {
      const response = await intelApiClient.redeemReward(trimmedPasscode);
      if (response.error) {
        return String(response.error);
      } else {
        return "Passcode redeemed successfully!";
      }
    } catch (e) {
      logManager.error(LOG_TAG, "Failed to redeem passcode", JSON.stringify(e));
      return "Failed to redeem passcode.";
    }
  }
}
