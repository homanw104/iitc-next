/**
 * Handle redeem requests.
 */

import type { RedeemResponse } from "../../types/api/redeemReward.ts";
import { apiRequestManager } from "../system/apiRequestManager.ts";

export class RedeemManager {
  public requestRedeem(passcode: string): Promise<RedeemResponse> {
    return apiRequestManager.redeemReward(passcode);
  }
}
