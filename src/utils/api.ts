/**
 * Typed client for Intel API requests and response normalization.
 */

import type { TileResponse } from "../types/ingress.ts";
import type {
  GameScoreResponse,
  GetPlextsPayload,
  GetPlextsResponse,
  IntelApiAction,
  IntelApiPayloads,
  IntelApiResponses,
  PortalDetailsResponse,
  RedeemResponse,
  SendPlextPayload,
  SendPlextResponse,
} from "../types/api.ts";
import { apiRequest } from "./network.ts";

const DEFAULT_MAX_RETRIES = 3;

interface RequestOptions {
  retries?: number;
}

type ResponseValidator<T> = (response: unknown) => T;

export class Api {
  public getGameScore(): Promise<GameScoreResponse> {
    return this.request("getGameScore", {}, validateGameScoreResponse);
  }

  public redeemReward(passcode: string): Promise<RedeemResponse> {
    return this.request("redeemReward", { passcode }, validateErrorResponse);
  }

  public sendPlext(payload: SendPlextPayload): Promise<SendPlextResponse> {
    return this.request("sendPlext", payload, validateErrorResponse);
  }

  public getPlexts(payload: GetPlextsPayload): Promise<GetPlextsResponse> {
    return this.request("getPlexts", payload, validateGetPlextsResponse);
  }

  public getPortalDetails(guid: string): Promise<PortalDetailsResponse> {
    return this.request("getPortalDetails", { guid }, validatePortalDetailsResponse, {
      retries: DEFAULT_MAX_RETRIES,
    });
  }

  public getEntities(tileKeys: string[]): Promise<TileResponse> {
    return this.request("getEntities", { tileKeys }, validateTileResponse, {
      retries: DEFAULT_MAX_RETRIES,
    });
  }

  private async request<Action extends IntelApiAction>(
    action: Action,
    payload: IntelApiPayloads[Action],
    validate: ResponseValidator<IntelApiResponses[Action]>,
    options: RequestOptions = {},
  ): Promise<IntelApiResponses[Action]> {
    const retries = options.retries ?? 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return validate(await apiRequest(action, payload));
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
      }
    }

    throw lastError;
  }
}

export const intelApiClient = new Api();

function validateGameScoreResponse(response: unknown): GameScoreResponse {
  const normalized = normalizeRecord(response, "getGameScore");
  if (!Array.isArray(normalized.result)) {
    throw new Error("Invalid getGameScore response: missing result array");
  }

  return normalized as unknown as GameScoreResponse;
}

function validateGetPlextsResponse(response: unknown): GetPlextsResponse {
  const normalized = normalizeRecord(response, "getPlexts");
  if (!Array.isArray(normalized.result)) {
    throw new Error("Invalid getPlexts response: missing result array");
  }

  return normalized as unknown as GetPlextsResponse;
}

function validatePortalDetailsResponse(response: unknown): PortalDetailsResponse {
  const normalized = normalizeRecord(response, "getPortalDetails");
  if (!Array.isArray(normalized.result)) {
    throw new Error("Invalid getPortalDetails response: missing result array");
  }

  return normalized as unknown as PortalDetailsResponse;
}

function validateTileResponse(response: unknown): TileResponse {
  const normalized = normalizeRecord(response, "getEntities");
  const result = normalized.result;
  if (!isRecord(result) || !isRecord(result.map)) {
    throw new Error("Invalid getEntities response: missing result map");
  }

  return normalized as unknown as TileResponse;
}

function validateErrorResponse<T extends { error?: unknown }>(response: unknown): T {
  return normalizeRecord(response, "Intel API") as T;
}

function normalizeRecord(response: unknown, action: string): Record<string, unknown> {
  if (!isRecord(response)) {
    throw new Error(`Invalid ${action} response: expected object`);
  }

  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
