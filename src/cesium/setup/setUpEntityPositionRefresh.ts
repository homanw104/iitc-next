/**
 * Refreshes shared entity terrain positions when terrain data changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entityPositionManager";

const CAMERA_IDLE_REFRESH_DELAY_MS = 500;

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
): void {
  let heightRefreshRequested = false;
  let heightCacheResetRequested = false;
  let cameraMoving = false;
  let idleRefreshTimeout: number | undefined;
  const watchedHeightTilesets = new WeakSet<Cesium.Cesium3DTileset>();

  const requestHeightRefresh = (resetHeightCache = false) => {
    heightRefreshRequested = true;
    heightCacheResetRequested = heightCacheResetRequested || resetHeightCache;
    scheduleIdleHeightRefresh();
  };

  const clearIdleRefresh = () => {
    if (idleRefreshTimeout === undefined) return;

    window.clearTimeout(idleRefreshTimeout);
    idleRefreshTimeout = undefined;
  };

  const scheduleIdleHeightRefresh = () => {
    clearIdleRefresh();

    if (cameraMoving) return;

    idleRefreshTimeout = window.setTimeout(() => {
      idleRefreshTimeout = undefined;
      viewer.scene.requestRender();
    }, CAMERA_IDLE_REFRESH_DELAY_MS);
  };

  viewer.scene.postRender.addEventListener(() => {
    if (!heightRefreshRequested || cameraMoving || idleRefreshTimeout !== undefined) return;

    heightRefreshRequested = false;
    if (heightCacheResetRequested) {
      heightCacheResetRequested = false;
      entityPositionManager.invalidateTerrainPositions();
    } else {
      entityPositionManager.refreshTerrainPositions();
    }
    viewer.scene.requestRender();
  });

  viewer.camera.moveStart.addEventListener(() => {
    cameraMoving = true;
    clearIdleRefresh();
  });

  viewer.camera.moveEnd.addEventListener(() => {
    cameraMoving = false;
    if (heightRefreshRequested) scheduleIdleHeightRefresh();
  });

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    requestHeightRefresh(true);
  });

  viewer.scene.globe.tileLoadProgressEvent.addEventListener((tilesLoading: number) => {
    if (tilesLoading === 0) requestHeightRefresh();
  });

  const watchHeightTileset = (primitive: unknown) => {
    if (!(primitive instanceof Cesium.Cesium3DTileset) || watchedHeightTilesets.has(primitive)) return;

    watchedHeightTilesets.add(primitive);
    requestHeightRefresh(true);

    primitive.initialTilesLoaded.addEventListener(() => requestHeightRefresh());
    primitive.allTilesLoaded.addEventListener(() => requestHeightRefresh());
    primitive.loadProgress.addEventListener((pendingRequests: number, tilesProcessing: number) => {
      if (pendingRequests === 0 && tilesProcessing === 0) requestHeightRefresh();
    });
  };

  for (let i = 0; i < viewer.scene.primitives.length; i++) {
    watchHeightTileset(viewer.scene.primitives.get(i));
  }

  viewer.scene.primitives.primitiveAdded.addEventListener(watchHeightTileset);
}
