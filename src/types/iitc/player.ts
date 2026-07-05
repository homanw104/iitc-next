import type { Team } from "../common/common.ts";

export interface Player {
  ap: string;
  availableInvites: number;
  energy: number;
  minApForCurrentLevel: number;
  minApForNextLevel: number;
  nickname: string;
  team: Team;
  verifiedLevel: number;
  xmCapacity: string;
}
