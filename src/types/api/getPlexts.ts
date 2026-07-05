import type { Team } from "../common/common.ts";

export interface GetPlextsPayload {
  minLatE6: number;
  minLngE6: number;
  maxLatE6: number;
  maxLngE6: number;
  minTimestampMs: number;
  maxTimestampMs: number;
  tab: string;
  ascendingTimestampOrder: boolean;
  plexContinuationGuid?: string;
}

export type PlextMarkType =
  "FACTION" |
  "PLAYER" |
  "PORTAL" |
  "SECURE" |
  "SENDER" |
  "TEXT";

export interface PlextMarkData {
  plain: string;
  team?: Team;
  latE6?: number;
  lngE6?: number;
  name?: string;
  address?: string;
}

export type PlextMark = [PlextMarkType, PlextMarkData];

export interface CommPlextData {
  text: string;
  team: Team;
  markup: PlextMark[];
  plextType: string;
  categories: number;
}

export type CommResponseItem = [
  guid: string,
  timestamp: number,
  data: {
    plext: CommPlextData;
  },
];

export interface GetPlextsResponse {
  result: CommResponseItem[];
  error?: unknown;
}
