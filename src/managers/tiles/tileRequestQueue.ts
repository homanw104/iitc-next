/**
 * Queue and concurrency control for Intel tile requests.
 */

import { intelApiClient } from "../../api/intelApiClient";
import { logManager } from "../system/logManager";
import type { TileResponse } from "../../types/ingress";

const LOG_TAG = "TileRequestQueue";
const MAX_REQUESTS: number = 5;
const TILES_PER_REQUEST: number = 25;

export type TileStatus = "queued" | "requested" | "loaded" | "error";
export type TileStatusCallback = (key: string, status: TileStatus) => void;
export type TileResponseHandler = (response: TileResponse, tileKeys: string[], refreshExisting: boolean) => Promise<void>;

interface TileRequestBatch {
  tileKeys: string[];
  refreshExisting: boolean;
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

  public forgetRequestedTile(tileKey: string): void {
    this.requestedTiles.delete(tileKey);
  }

  public forgetRequestedTiles(tileKeys: Iterable<string>): void {
    for (const key of tileKeys) {
      this.requestedTiles.delete(key);
    }
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
      this.processQueue(shouldRefreshExisting);
      this.resolveIdleWaiters();
    });
  }

  private processQueue(refreshExisting: boolean = false): void {
    if (this.activeRequestCount >= MAX_REQUESTS) {
      logManager.info(LOG_TAG, `Max request count of ${MAX_REQUESTS} reached`);
      return;
    }

    if (this.queuedTiles.size === 0) {
      logManager.info(LOG_TAG, "Loaded all tiles");
      this.resolveIdleWaiters();
      return;
    }

    let shouldRefreshExisting = refreshExisting;
    while (this.activeRequestCount < MAX_REQUESTS && this.queuedTiles.size > 0) {
      const batch = this.takeNextBatch(shouldRefreshExisting);
      shouldRefreshExisting = false;
      this.processBatch(batch).then();
    }
  }

  private takeNextBatch(refreshExisting: boolean): TileRequestBatch {
    const tileKeys: string[] = [];
    for (const key of this.queuedTiles) {
      tileKeys.push(key);
      this.queuedTiles.delete(key);
      this.requestedTiles.add(key);
      this.setTileStatus(key, "requested");
      if (tileKeys.length >= TILES_PER_REQUEST) break;
    }

    return { tileKeys, refreshExisting };
  }

  private async processBatch(batch: TileRequestBatch): Promise<void> {
    this.activeRequestCount++;

    logManager.debug(LOG_TAG, `Sending request for ${batch.tileKeys.length} tiles`);
    const size = this.queuedTiles.size + batch.tileKeys.length;
    logManager.info(
      LOG_TAG,
      `Loading ${size} tile${size === 1 ? "" : "s"}`
    );

    try {
      const response = await intelApiClient.getEntities(batch.tileKeys);
      logManager.debug(LOG_TAG, `Received response for ${batch.tileKeys.length} tile${batch.tileKeys.length === 1 ? "" : "s"}`);
      await this.handleResponse(response, batch.tileKeys, batch.refreshExisting);
    } catch (error) {
      logManager.error(LOG_TAG, "Tile request failed:", error);
      batch.tileKeys.forEach((key) => {
        this.requestedTiles.delete(key);
        this.setTileStatus(key, "error");
      });
    } finally {
      this.activeRequestCount--;
      this.scheduleQueueProcessing();
    }
  }
}
