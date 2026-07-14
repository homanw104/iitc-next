/**
 * Facade for view-based Intel tile loading.
 */

import type * as Cesium from "cesium";
import type { FieldManager } from "../entity/fieldManager";
import type { LinkManager } from "../entity/linkManager";
import type { PortalManager } from "../entity/portalManager";
import type { PortalArtifactManager } from "../entity/portalArtifactManager";
import type { PortalHistoryManager } from "../entity/portalHistoryManager";
import type { PortalLabelManager } from "../entity/portalLabelManager";
import type { PortalOrnamentManager } from "../entity/portalOrnamentManager";
import type { ScoutHistoryManager } from "../entity/scoutHistoryManager";
import { logManager } from "../system/logManager";
import { settingsManager, type RefreshIntervalMs } from "../system/settingsManager";
import { TileEntityHydrator } from "./tileRequestEntityHydrator";
import { TileRequestQueue, type TileStatusCallback } from "./tileRequestQueue";
import { ViewTileCalculator } from "./tileRequestViewCalculator";
import type { TileResponse } from "../../types/api/getEntities.ts";

const LOG_TAG = "TileRequestManager";

export type { TileStatus, TileStatusCallback } from "./tileRequestQueue";

export class TileRequestManager {
  private readonly viewTileCalculator: ViewTileCalculator;
  private readonly tileEntityHydrator: TileEntityHydrator;
  private readonly tileRequestQueue: TileRequestQueue;
  private refreshIntervalId: number | null = null;

  constructor(
    viewer: Cesium.Viewer,
    portalManager: PortalManager,
    portalLabelManager: PortalLabelManager,
    portalOrnamentManager: PortalOrnamentManager,
    portalArtifactManager: PortalArtifactManager,
    portalHistoryManager: PortalHistoryManager,
    scoutHistoryManager: ScoutHistoryManager,
    linkManager: LinkManager,
    fieldManager: FieldManager,
  ) {
    this.viewTileCalculator = new ViewTileCalculator(viewer);
    this.tileEntityHydrator = new TileEntityHydrator(
      viewer,
      portalManager,
      portalLabelManager,
      portalOrnamentManager,
      portalArtifactManager,
      portalHistoryManager,
      scoutHistoryManager,
      linkManager,
      fieldManager,
    );
    this.tileRequestQueue = new TileRequestQueue(this.handleQueuedResponse);
    this.updateRefreshInterval(settingsManager.getRefreshIntervalMs());
  }

  public refreshView(): void {
    const tileKeys = this.viewTileCalculator.calculateTileKeys();

    if (tileKeys.length > 0) {
      this.tileRequestQueue.removeTiles(tileKeys);
      this.tileRequestQueue.addTiles(tileKeys, true);
    }
  }

  public requestTilesForCurrentView(): void {
    const tileKeys = this.viewTileCalculator.calculateTileKeys();
    if (tileKeys.length > 0) this.tileRequestQueue.addTiles(tileKeys);
  }

  public getRefreshIntervalMs(): RefreshIntervalMs {
    return settingsManager.getRefreshIntervalMs();
  }

  public setRefreshIntervalMs(intervalMs: RefreshIntervalMs): void {
    settingsManager.setRefreshIntervalMs(intervalMs);
    this.updateRefreshInterval(intervalMs);
  }

  public onTileStatusChange(callback: TileStatusCallback): void {
    this.tileRequestQueue.onTileStatusChange(callback);
  }

  public waitForIdle(): Promise<void> {
    return this.tileRequestQueue.waitForIdle();
  }

  private updateRefreshInterval(intervalMs: RefreshIntervalMs): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }

    if (intervalMs === null) return;

    this.refreshIntervalId = window.setInterval(() => {
      this.refreshView();
      logManager.info(LOG_TAG, `Refreshing view after ${intervalMs / 1000} seconds`);
    }, intervalMs);
  }

  private handleQueuedResponse = async (
    response: TileResponse,
    tileKeys: string[],
    refreshExisting: boolean,
  ): Promise<void> => {
    if (response && refreshExisting) {
      const viewRect = this.viewTileCalculator.computeViewRectangle();
      if (!viewRect) return;
      this.tileEntityHydrator.removeEntitiesInView(viewRect);
    }

    await this.tileEntityHydrator.handleResponse(response, tileKeys, this.tileRequestQueue);
  };
}
