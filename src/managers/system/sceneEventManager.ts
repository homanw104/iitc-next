/**
 * Coordinates scene-level startup events and readiness promises.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";

const LOG_TAG = "SceneEventManager";
const GOOGLE_3D_TILES_QUALITY_SETTLE_MS = 750;
const GOOGLE_3D_TILES_QUALITY_STABLE_FRAMES = 3;

export class SceneEventManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly initSceneLoadedPromise: Promise<void>;
  private initSceneLoaded = false;
  private watchedGoogleTilesets = new WeakSet<Cesium.Cesium3DTileset>();
  private maxGoogleTilesLoadingCountObserved = 1;
  private lastGoogleTilesProgress = -1;

  constructor(private readonly viewer: Cesium.Viewer) {
    this.initSceneLoadedPromise = this.createInitSceneLoadedPromise();

    if (this.useGoogle3dTiles) this.watchGoogleTilesets();
  }

  public waitForInitSceneLoaded(): Promise<void> {
    return this.initSceneLoadedPromise;
  }

  private createInitSceneLoadedPromise(): Promise<void> {
    return new Promise((resolve) => {
      const cleanupCallbacks: Array<() => void> = [];
      let initTileset: Cesium.Cesium3DTileset | undefined;

      const resolveOnce = () => {
        if (this.initSceneLoaded) return;

        this.initSceneLoaded = true;
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

      const waitForTerrainTiles = () => {
        if (this.isTerrainReady()) resolveOnce();
      };

      const removeTerrainProviderChangedListener = this.viewer.scene.globe.terrainProviderChanged.addEventListener(waitForTerrainTiles);
      const removeTileLoadProgressListener = this.viewer.scene.globe.tileLoadProgressEvent.addEventListener(waitForTerrainTiles);
      const removePostRenderListener = this.viewer.scene.postRender.addEventListener(() => {
        if (this.useGoogle3dTiles) {
          waitForGoogleTiles();
        } else {
          waitForTerrainTiles();
        }
      });
      if (this.useGoogle3dTiles) {
        cleanupCallbacks.push(this.viewer.scene.primitives.primitiveAdded.addEventListener(waitForGoogleTiles));
      }
      cleanupCallbacks.push(
        removeTerrainProviderChangedListener,
        removeTileLoadProgressListener,
        removePostRenderListener
      );

      if (this.useGoogle3dTiles) {
        waitForGoogleTiles();
      } else {
        waitForTerrainTiles();
      }
      this.viewer.scene.requestRender();

      function cleanup(): void {
        cleanupCallbacks.splice(0).forEach((cleanupCallback) => cleanupCallback());
      }
    });
  }

  private isTerrainReady(): boolean {
    return this.viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider
      || this.viewer.scene.globe.tilesLoaded;
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

  private waitForGoogleTilesQuality(tileset: Cesium.Cesium3DTileset, resolve: () => void): (() => void) & { cancel: () => void } {
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
      if (!isWaiting || this.initSceneLoaded) return;

      this.viewer.scene.requestRender();
      renderTimer = setTimeout(requestSettlingRender, 100);
    };

    const checkSettled = () => {
      if (this.initSceneLoaded) {
        cancel();
        return;
      }

      if (!tileset.tilesLoaded) {
        settleStartTime = 0;
        stableFrames = 0;
        return;
      }

      if (settleStartTime === 0) settleStartTime = performance.now();
      stableFrames += 1;

      if (performance.now() - settleStartTime < GOOGLE_3D_TILES_QUALITY_SETTLE_MS) return;
      if (stableFrames < GOOGLE_3D_TILES_QUALITY_STABLE_FRAMES) return;

      cancel();
      resolve();
    };

    const waitForQuality = () => {
      if (isWaiting || this.initSceneLoaded) return;

      isWaiting = true;
      removePostRenderListener = this.viewer.scene.postRender.addEventListener(checkSettled);
      requestSettlingRender();
      checkSettled();
    };

    waitForQuality.cancel = cancel;
    return waitForQuality;
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
