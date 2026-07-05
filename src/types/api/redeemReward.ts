import type { Team } from "../common/common.ts";

export interface RedeemRewardPayload {
  passcode: string;
}

export interface RedeemRewardsInventoryAward {
  level: number;
  count: number;
}

export interface RedeemRewardsInventory {
  name: string;
  awards: RedeemRewardsInventoryAward[];
}

export interface RedeemRewards {
  ap?: string;
  xm?: string;
  other?: string[];
  inventory?: RedeemRewardsInventory[];
}

export interface RedeemPlayerData {
  ap: string;
  energy: number;
  team: Team;
  available_invites: number;
  verified_level: number;
  xm_capacity: string;
  min_ap_for_current_level: string | number;
  min_ap_for_next_level: string | number;
  guid: string;
  recursion_count?: string;
  nickname: string;
}

export interface RedeemResponse {
  rewards?: RedeemRewards;
  playerData?: RedeemPlayerData;
  error?: unknown;
}
