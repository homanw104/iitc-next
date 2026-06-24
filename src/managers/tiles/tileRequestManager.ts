/**
 * Facade for view-based Intel tile loading.
 */

import * as Cesium from "cesium";
import { FieldEntityManager } from "../entity/fieldEntityManager";
import { LinkEntityManager } from "../entity/linkEntityManager";
import { logManager } from "../system/logManager";
import { PortalEntityManager } from "../entity/portalEntityManager";
import { PortalHistoryEntityManager } from "../entity/portalHistoryEntityManager";
import { PortalLabelEntityManager } from "../entity/portalLabelEntityManager";
import { PortalOrnamentEntityManager } from "../entity/portalOrnamentEntityManager";
import { ScoutHistoryEntityManager } from "../entity/scoutHistoryEntityManager";
import { settingsManager, type RefreshIntervalMs } from "../system/settingsManager";
import { TileEntityHydrator } from "./tileRequestEntityHydrator";
import { TileRequestQueue, type TileStatusCallback } from "./tileRequestQueue";
import { ViewTileCalculator } from "./tileRequestViewCalculator";

const LOG_TAG = "TileRequestManager";

export type { TileStatus, TileStatusCallback } from "./tileRequestQueue";

export class TileRequestManager {
  private readonly viewTileCalculator: ViewTileCalculator;
  private readonly tileEntityHydrator: TileEntityHydrator;
  private readonly tileRequestQueue: TileRequestQueue;
  private refreshIntervalId: number | null = null;

  constructor(
    private readonly viewer: Cesium.Viewer,
    portalEntityManager: PortalEntityManager,
    portalLabelEntityManager: PortalLabelEntityManager,
    portalOrnamentEntityManager: PortalOrnamentEntityManager,
    portalHistoryEntityManager: PortalHistoryEntityManager,
    scoutHistoryEntityManager: ScoutHistoryEntityManager,
    linkEntityManager: LinkEntityManager,
    fieldEntityManager: FieldEntityManager,
  ) {
    this.viewTileCalculator = new ViewTileCalculator(viewer);
    this.tileEntityHydrator = new TileEntityHydrator(
      viewer,
      portalEntityManager,
      portalLabelEntityManager,
      portalOrnamentEntityManager,
      portalHistoryEntityManager,
      scoutHistoryEntityManager,
      linkEntityManager,
      fieldEntityManager,
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
    response: unknown,
    tileKeys: string[],
    refreshExisting: boolean
  ): Promise<void> => {
    if (response && refreshExisting) {
      const viewRect = this.viewTileCalculator.computeViewRectangle();
      if (!viewRect) return;
      this.tileEntityHydrator.removeEntitiesInView(viewRect);
    }

    await this.tileEntityHydrator.handleResponse(response, tileKeys, this.tileRequestQueue);
  };
}
