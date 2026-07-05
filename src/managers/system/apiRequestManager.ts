/**
 * Handles Intel API version setup, requests, and response normalization.
 */

import type {
  IntelApiAction,
  IntelApiPayloads,
  IntelApiResponses,
} from "../../types/api/api.ts";
import type { TileResponse } from "../../types/api/getEntities.ts";
import type { GameScoreResponse } from "../../types/api/getGameScore.ts";
import type { GetPlextsPayload, GetPlextsResponse } from "../../types/api/getPlexts.ts";
import type { PortalDetailsResponse } from "../../types/api/getPortalDetails.ts";
import type { RedeemResponse } from "../../types/api/redeemReward.ts";
import type { SendPlextPayload, SendPlextResponse } from "../../types/api/sendPlext.ts";
import { getCookie } from "../../utils/browser.ts";
import { safeLocalStorage } from "../../utils/storage.ts";
import { logManager } from "./logManager";

const LOG_TAG = "ApiRequestManager";
const VERSION_STORAGE_KEY = "iitc-next-api-version";
const VERSION_PATTERN = /gen_dashboard_([a-f0-9]{40})\.js/;
const DEFAULT_MAX_RETRIES = 3;

interface RequestOptions {
  retries?: number;
}

type ResponseValidator<T> = (response: unknown) => T;

export class ApiRequestManager {
  private apiVersion: string | undefined;

  public initialize(): void {
    const version = this.extractVersionFromScript();
    if (version) {
      this.setApiVersion(version);
      this.storeVersion(version);
      logManager.debug(LOG_TAG, `Extracted version string ${version}`);
      return;
    }

    const storedVersion = this.getStoredVersion();
    if (storedVersion) {
      this.setApiVersion(storedVersion);
      logManager.debug(LOG_TAG, `Using stored version string ${storedVersion}`);
      return;
    }

    if (this.getApiVersion()) {
      logManager.debug(LOG_TAG, "Using previously extracted version string");
      return;
    }

    logManager.warn(LOG_TAG, "Could not extract version: Requests may fail");
  }

  public setApiVersion(version: string): void {
    this.apiVersion = version;
  }

  public getApiVersion(): string | undefined {
    return this.apiVersion;
  }

  public getGameScore(): Promise<GameScoreResponse> {
    return this.request("getGameScore", {}, validateGameScoreResponse);
  }

  public redeemReward(passcode: string): Promise<RedeemResponse> {
    return this.request("redeemReward", { passcode }, validateRedeemResponse);
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
        return validate(await this.apiRequest(action, payload));
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
      }
    }

    throw lastError;
  }

  private async apiRequest<Action extends IntelApiAction>(
    action: Action,
    data: IntelApiPayloads[Action],
  ): Promise<unknown> {
    const csrfToken = getCookie("csrftoken");

    if (!this.apiVersion) {
      logManager.warn(LOG_TAG, "API version not set, requests might fail.");
    }

    const response = await fetch(`/r/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-CSRFToken": csrfToken || "",
      },
      body: JSON.stringify({
        ...data,
        v: this.apiVersion,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  private extractVersionFromScript(): string | undefined {
    const script = document.querySelector<HTMLScriptElement>("script[src^=\"/jsc/gen_dashboard_\"]");
    if (!script) return undefined;

    const match = VERSION_PATTERN.exec(script.getAttribute("src") || "");
    return match?.[1];
  }

  private getStoredVersion(): string | undefined {
    const version = safeLocalStorage.getItem(VERSION_STORAGE_KEY);
    if (version && /^[a-f0-9]{40}$/.test(version)) {
      return version;
    }

    return undefined;
  }

  private storeVersion(version: string): void {
    safeLocalStorage.setItem(VERSION_STORAGE_KEY, version);
  }
}

export const apiRequestManager = new ApiRequestManager();

function validateGameScoreResponse(response: unknown): GameScoreResponse {
  const normalized = normalizeRecord(response, "getGameScore");
  if (!Array.isArray(normalized.result)) {
    throw new Error("Invalid getGameScore response: missing result array");
  }

  return normalized as unknown as GameScoreResponse;
}

function validateRedeemResponse(response: unknown): RedeemResponse {
  const normalized = normalizeRecord(response, "redeemReward");
  if (normalized.error !== undefined) {
    return normalized as unknown as RedeemResponse;
  }

  if (!isRecord(normalized.rewards)) {
    throw new Error("Invalid redeemReward response: missing rewards object");
  }

  return normalized as unknown as RedeemResponse;
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
