import type { Team } from "../common/common.ts";

export interface LinkData {
  guid: string;
  team: Team;
  oGuid: string;
  oLatE6: number;
  oLngE6: number;
  dGuid: string;
  dLatE6: number;
  dLngE6: number;
  timestamp: number;
}
