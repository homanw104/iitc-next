import type { GetEntitiesPayload, TileResponse } from "./getEntities.ts";
import type { GameScoreResponse, GetGameScorePayload } from "./getGameScore.ts";
import type { GetPlextsPayload, GetPlextsResponse } from "./getPlexts.ts";
import type { GetPortalDetailsPayload, PortalDetailsResponse } from "./getPortalDetails.ts";
import type { RedeemResponse, RedeemRewardPayload } from "./redeemReward.ts";
import type { SendPlextPayload, SendPlextResponse } from "./sendPlext.ts";

export interface IntelApiPayloads {
  getGameScore: GetGameScorePayload;
  redeemReward: RedeemRewardPayload;
  sendPlext: SendPlextPayload;
  getPlexts: GetPlextsPayload;
  getPortalDetails: GetPortalDetailsPayload;
  getEntities: GetEntitiesPayload;
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
