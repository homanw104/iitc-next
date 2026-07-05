import type { Team } from "../common/common.ts";

export interface FieldData {
  guid: string;
  team: Team;
  points: FieldPoint[];
  timestamp: number;
}

export interface FieldPoint {
  guid: string;
  latE6: number;
  lngE6: number;
}
