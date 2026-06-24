/**
 * Queue and concurrency control for Intel tile requests.
 */

import { apiRequest } from "../../utils/network";
import { logManager } from "../system/logManager";

const LOG_TAG = "TileRequestQueue";
const MAX_REQUESTS: number = 5;
const TILES_PER_REQUEST: number = 25;

export type TileStatus = "queued" | "requested" | "loaded" | "error";
export type TileStatusCallback = (key: string, status: TileStatus) => void;
export type TileResponseHandler = (response: unknown, tileKeys: string[], refreshExisting: boolean) => Promise<void>;

export class TileRequest {
  public tileKeys: string[];
  public active: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor(tileKeys: string[]) {
    this.tileKeys = tileKeys;
  }

  public async send(): Promise<unknown> {
    this.active = true;
    try {
      const response = await apiRequest("getEntities", { tileKeys: this.tileKeys });
      this.active = false;
      return response;
    } catch (error) {
      this.active = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        return this.send();
      }
      throw error;
    }
  }
}

export class TileRequestQueue {
  private activeRequestCount: number = 0;
  private queuedTiles: Set<string> = new Set();
  private requestedTiles: Set<string> = new Set();
  private tileStatuses: Map<string, TileStatus> = new Map();
  private tileStatusListeners: TileStatusCallback[] = [];
  private idleResolvers: (() => void)[] = [];
  private queueProcessingScheduled = false;
  private scheduledRefreshExisting = false;

  constructor(private readonly handleResponse: TileResponseHandler) {}

  public addTiles(tileKeys: string[], refreshExisting: boolean = false): void {
    logManager.debug(LOG_TAG, `Adding ${tileKeys.length} tiles to queue`);
    let skippedCount = 0;
    tileKeys.forEach((key) => {
      if (!this.requestedTiles.has(key) && !this.queuedTiles.has(key)) {
        this.queuedTiles.add(key);
        this.setTileStatus(key, "queued");
      } else {
        skippedCount += 1;
      }
    });
    logManager.debug(LOG_TAG, `Skipped ${skippedCount} tile${skippedCount === 1 ? "" : "s"}`);
    this.scheduleQueueProcessing(refreshExisting);
  }

  public removeTiles(tileKeys: string[]): void {
    logManager.debug(LOG_TAG, `Removing ${tileKeys.length} tiles from registry`);
    tileKeys.forEach((key) => {
      if (this.queuedTiles.has(key)) {
        this.queuedTiles.delete(key);
      }
      if (this.requestedTiles.has(key)) {
        this.requestedTiles.delete(key);
      }
    });
    this.scheduleQueueProcessing();
  }

  public onTileStatusChange(callback: TileStatusCallback): void {
    this.tileStatusListeners.push(callback);
  }

  public waitForIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();

    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  public setTileStatus(key: string, status: TileStatus): void {
    this.tileStatuses.set(key, status);
    this.tileStatusListeners.forEach((cb) => cb(key, status));
  }

  public forgetRequestedTiles(tileKeys: string[]): void {
    tileKeys.forEach((key) => this.requestedTiles.delete(key));
  }

  private isIdle(): boolean {
    return this.activeRequestCount === 0 && this.queuedTiles.size === 0;
  }

  private resolveIdleWaiters(): void {
    if (!this.isIdle()) return;

    const resolvers = this.idleResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
  }

  private scheduleQueueProcessing(refreshExisting: boolean = false): void {
    this.scheduledRefreshExisting ||= refreshExisting;
    if (this.queueProcessingScheduled) return;

    this.queueProcessingScheduled = true;
    window.queueMicrotask(() => {
      const shouldRefreshExisting = this.scheduledRefreshExisting;
      this.queueProcessingScheduled = false;
      this.scheduledRefreshExisting = false;
      this.processQueue(shouldRefreshExisting).then(() => this.resolveIdleWaiters());
    });
  }

  private async processQueue(refreshExisting: boolean = false): Promise<void> {
    if (this.activeRequestCount >= MAX_REQUESTS) {
      logManager.info(LOG_TAG, `Max request count of ${MAX_REQUESTS} reached`);
      return;
    }

    if (this.queuedTiles.size === 0) {
      logManager.info(LOG_TAG, "Loaded all tiles");
      this.resolveIdleWaiters();
      return;
    }

    const tilesToRequest = Array.from(this.queuedTiles).slice(0, TILES_PER_REQUEST);
    tilesToRequest.forEach((key) => {
      this.queuedTiles.delete(key);
      this.requestedTiles.add(key);
      this.setTileStatus(key, "requested");
    });

    const request = new TileRequest(tilesToRequest);
    this.activeRequestCount++;

    logManager.debug(LOG_TAG, `Sending request for ${tilesToRequest.length} tiles`);
    const size = this.queuedTiles.size + tilesToRequest.length;
    logManager.info(
      LOG_TAG,
      `Loading ${size} tile${size === 1 ? "" : "s"}`
    );

    try {
      const response = await request.send();
      logManager.debug(LOG_TAG, `Received response for ${tilesToRequest.length} tile${tilesToRequest.length === 1 ? "" : "s"}`);
      await this.handleResponse(response, tilesToRequest, refreshExisting);
    } catch (error) {
      logManager.error(LOG_TAG, "Tile request failed:", error);
      tilesToRequest.forEach((key) => {
        this.requestedTiles.delete(key);
        this.setTileStatus(key, "error");
      });
    } finally {
      this.activeRequestCount--;
      this.scheduleQueueProcessing();
    }
  }
}
