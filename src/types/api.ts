/**
 * Type definitions for Intel API request and response payloads.
 */

import type { Team, TileResponse } from "./ingress";

export interface IntelResponseWithError {
  error?: unknown;
}

export interface GameScoreResponse extends IntelResponseWithError {
  result?: string[];
}

export interface RedeemResponse extends IntelResponseWithError {
  result?: string;
}

export type SendPlextResponse = IntelResponseWithError;

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

export interface GetPlextsResponse extends IntelResponseWithError {
  result: CommResponseItem[];
}

export interface PortalDetailsResponse extends IntelResponseWithError {
  result: unknown[];
}

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

export interface SendPlextPayload {
  message: string;
  latE6: number;
  lngE6: number;
  tab: string;
}

export interface IntelApiPayloads {
  getGameScore: Record<string, never>;
  redeemReward: {
    passcode: string;
  };
  sendPlext: SendPlextPayload;
  getPlexts: GetPlextsPayload;
  getPortalDetails: {
    guid: string;
  };
  getEntities: {
    tileKeys: string[];
  };
}

export interface IntelApiResponses {
  getGameScore: GameScoreResponse;
  redeemReward: RedeemResponse;
  sendPlext: SendPlextResponse;
  getPlexts: GetPlextsResponse;
  getPortalDetails: PortalDetailsResponse;
  getEntities: TileResponse;
}

export type IntelApiAction = keyof IntelApiPayloads;
