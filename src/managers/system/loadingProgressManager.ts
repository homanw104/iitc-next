/**
 * Coordinates scene-level startup events and readiness promises.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";

const LOG_TAG = "LoadingProgressManager";
const GLOBE_TILES_QUALITY_SETTLE_MS = 750;
const GLOBE_TILES_QUALITY_STABLE_FRAMES = 3;
const GOOGLE_3D_TILES_QUALITY_SETTLE_MS = 750;
const GOOGLE_3D_TILES_QUALITY_STABLE_FRAMES = 3;

type QualityWaiter = (() => void) & { cancel: () => void };

export class LoadingProgressManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly initSceneLoadedPromise: Promise<void>;
  private initSceneLoaded = false;
  private watchedGoogleTilesets = new WeakSet<Cesium.Cesium3DTileset>();
  private maxGlobeTilesLoadingCountObserved = 1;
  private maxGoogleTilesLoadingCountObserved = 1;
  private lastGlobeTilesProgress = -1;
  private lastGoogleTilesProgress = -1;

  constructor(
    private readonly viewer: Cesium.Viewer,
  ) {
    this.initSceneLoadedPromise = this.createInitSceneLoadedPromise();
    if (this.useGoogle3dTiles) this.watchGoogleTilesets();
  }

  public waitForInitSceneLoaded(): Promise<void> {
    return this.initSceneLoadedPromise;
  }

  public waitForGlobeTilesLoaded(): Promise<void> {
    return new Promise((resolve) => {
      const waitForQuality = this.waitForGlobeTilesQuality(resolve, false);
      waitForQuality();
    });
  }

  private createInitSceneLoadedPromise(): Promise<void> {
    return new Promise((resolve) => {
      const cleanupCallbacks: Array<() => void> = [];
      let initTileset: Cesium.Cesium3DTileset | undefined;

      const resolveOnce = () => {
        if (this.initSceneLoaded) return;

        this.initSceneLoaded = true;
        this.logGlobeTilesProgress(100);
        this.logGoogleTilesProgress(100);
        cleanup();
        resolve();
        this.viewer.scene.requestRender();
        logManager.debug(LOG_TAG, "Init scene loaded");
      };

      const waitForGoogleTiles = () => {
        const tileset = this.findGoogleTileset();
        if (!tileset || tileset === initTileset) return;

        initTileset = tileset;
        const waitForQuality = this.waitForGoogleTilesQuality(tileset, resolveOnce);
        const removeAllTilesLoadedListener = tileset.allTilesLoaded.addEventListener(waitForQuality);
        const removeLoadProgressListener = tileset.loadProgress.addEventListener((pendingRequests: number, tilesProcessing: number) => {
          if (pendingRequests === 0 && tilesProcessing === 0 && tileset.tilesLoaded) waitForQuality();
        });
        cleanupCallbacks.push(waitForQuality.cancel, removeAllTilesLoadedListener, removeLoadProgressListener);

        if (tileset.tilesLoaded) waitForQuality();
      };

      const shouldWaitForGoogleTiles = () => this.useGoogle3dTiles && !this.viewer.scene.globe.show;
      const waitForTerrainTiles = () => {
        if (shouldWaitForGoogleTiles()) return;
        if (this.viewer.scene.globe.tilesLoaded) waitForGlobeTilesQuality();
      };

      const trackGlobeTilesProgress = (tilesLoading: number) => {
        this.logGlobeTilesLoadProgress(tilesLoading);
        waitForTerrainTiles();
      };
      const waitForGlobeTilesQuality = this.waitForGlobeTilesQuality(resolveOnce);
      const removeTerrainProviderChangedListener = this.viewer.scene.globe.terrainProviderChanged.addEventListener(waitForTerrainTiles);
      const removeTileLoadProgressListener = this.viewer.scene.globe.tileLoadProgressEvent.addEventListener(trackGlobeTilesProgress);
      const removePostRenderListener = this.viewer.scene.postRender.addEventListener(() => {
        if (shouldWaitForGoogleTiles()) {
          waitForGoogleTiles();
        } else {
          waitForTerrainTiles();
        }
      });
      if (this.useGoogle3dTiles) {
        cleanupCallbacks.push(this.viewer.scene.primitives.primitiveAdded.addEventListener(waitForGoogleTiles));
      }
      cleanupCallbacks.push(
        waitForGlobeTilesQuality.cancel,
        removeTerrainProviderChangedListener,
        removeTileLoadProgressListener,
        removePostRenderListener,
      );

      if (shouldWaitForGoogleTiles()) {
        waitForGoogleTiles();
      } else {
        if (!this.useGoogle3dTiles) this.logGlobeTilesProgress(0);
        waitForTerrainTiles();
      }
      this.viewer.scene.requestRender();

      function cleanup(): void {
        cleanupCallbacks.splice(0).forEach((cleanupCallback) => cleanupCallback());
      }
    });
  }

  private watchGoogleTilesets(): void {
    for (let i = 0; i < this.viewer.scene.primitives.length; i++) {
      this.watchGoogleTileset(this.viewer.scene.primitives.get(i));
    }

    this.viewer.scene.primitives.primitiveAdded.addEventListener((primitive: unknown) => {
      this.watchGoogleTileset(primitive);
    });
  }

  private watchGoogleTileset(primitive: unknown): void {
    if (!(primitive instanceof Cesium.Cesium3DTileset) || this.watchedGoogleTilesets.has(primitive)) return;

    this.watchedGoogleTilesets.add(primitive);
    this.logGoogleTilesProgress(0);
    primitive.loadProgress.addEventListener((pendingRequests: number, tilesProcessing: number) => {
      const outstandingWork = pendingRequests + tilesProcessing;
      this.maxGoogleTilesLoadingCountObserved = Math.max(this.maxGoogleTilesLoadingCountObserved, outstandingWork);
      if (outstandingWork === 0) {
        this.logGoogleTilesProgress(95);
        return;
      }

      const completedRatio = 1 - outstandingWork / this.maxGoogleTilesLoadingCountObserved;
      const percent = Math.max(1, Math.min(95, Math.round(1 + completedRatio * 94)));
      this.logGoogleTilesProgress(percent);
    });
  }

  private waitForGlobeTilesQuality(resolve: () => void, stopWhenInitSceneLoaded = true): QualityWaiter {
    return this.waitForTilesQuality(
      () => this.viewer.scene.globe.tilesLoaded,
      GLOBE_TILES_QUALITY_SETTLE_MS,
      GLOBE_TILES_QUALITY_STABLE_FRAMES,
      resolve,
      stopWhenInitSceneLoaded,
    );
  }

  private waitForGoogleTilesQuality(tileset: Cesium.Cesium3DTileset, resolve: () => void): QualityWaiter {
    return this.waitForTilesQuality(
      () => tileset.tilesLoaded,
      GOOGLE_3D_TILES_QUALITY_SETTLE_MS,
      GOOGLE_3D_TILES_QUALITY_STABLE_FRAMES,
      resolve,
    );
  }

  private waitForTilesQuality(
    isLoaded: () => boolean,
    settleMs: number,
    stableFramesRequired: number,
    resolve: () => void,
    stopWhenInitSceneLoaded = true,
  ): QualityWaiter {
    let isWaiting = false;
    let settleStartTime = 0;
    let stableFrames = 0;
    let removePostRenderListener: (() => void) | undefined;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;

    const cancel = () => {
      if (removePostRenderListener) {
        removePostRenderListener();
        removePostRenderListener = undefined;
      }
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = undefined;
      }
    };

    const requestSettlingRender = () => {
      if (!isWaiting || (stopWhenInitSceneLoaded && this.initSceneLoaded)) return;

      this.viewer.scene.requestRender();
      renderTimer = setTimeout(requestSettlingRender, 100);
    };

    const checkSettled = () => {
      if (stopWhenInitSceneLoaded && this.initSceneLoaded) {
        cancel();
        return;
      }

      if (!isLoaded()) {
        settleStartTime = 0;
        stableFrames = 0;
        return;
      }

      if (settleStartTime === 0) settleStartTime = performance.now();
      stableFrames += 1;

      if (performance.now() - settleStartTime < settleMs) return;
      if (stableFrames < stableFramesRequired) return;

      cancel();
      resolve();
    };

    const waitForQuality = () => {
      if (isWaiting || (stopWhenInitSceneLoaded && this.initSceneLoaded)) return;

      isWaiting = true;
      removePostRenderListener = this.viewer.scene.postRender.addEventListener(checkSettled);
      requestSettlingRender();
      checkSettled();
    };

    waitForQuality.cancel = cancel;
    return waitForQuality;
  }

  private logGlobeTilesLoadProgress(tilesLoading: number): void {
    this.maxGlobeTilesLoadingCountObserved = Math.max(this.maxGlobeTilesLoadingCountObserved, tilesLoading);
    if (tilesLoading === 0) {
      this.logGlobeTilesProgress(95);
      return;
    }

    const completedRatio = 1 - tilesLoading / this.maxGlobeTilesLoadingCountObserved;
    const percent = Math.max(1, Math.min(95, Math.round(1 + completedRatio * 94)));
    this.logGlobeTilesProgress(percent);
  }

  private logGlobeTilesProgress(percent: number): void {
    if (this.useGoogle3dTiles) return;
    if (percent <= this.lastGlobeTilesProgress) return;

    this.lastGlobeTilesProgress = percent;
    logManager.info(LOG_TAG, `Loading Globe Tiles ${percent}%`);
  }

  private logGoogleTilesProgress(percent: number): void {
    if (!this.useGoogle3dTiles) return;
    if (percent <= this.lastGoogleTilesProgress) return;

    this.lastGoogleTilesProgress = percent;
    logManager.info(LOG_TAG, `Loading Google 3D Tiles ${percent}%`);
  }

  private findGoogleTileset(): Cesium.Cesium3DTileset | undefined {
    for (let i = 0; i < this.viewer.scene.primitives.length; i++) {
      const primitive = this.viewer.scene.primitives.get(i);
      if (primitive instanceof Cesium.Cesium3DTileset) return primitive;
    }

    return undefined;
  }
}
