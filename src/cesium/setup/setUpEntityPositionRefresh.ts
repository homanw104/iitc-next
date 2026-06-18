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
  let refreshPending = false;
  let cameraMoving = false;
  let idleRefreshTimeout: number | undefined;
  const watchedTilesets = new WeakSet<Cesium.Cesium3DTileset>();

  const scheduleRefresh = () => {
    refreshPending = true;
    scheduleIdleRefresh();
  };

  const clearIdleRefresh = () => {
    if (idleRefreshTimeout === undefined) return;

    window.clearTimeout(idleRefreshTimeout);
    idleRefreshTimeout = undefined;
  };

  const scheduleIdleRefresh = () => {
    clearIdleRefresh();

    if (cameraMoving) {
      viewer.scene.requestRender();
      return;
    }

    idleRefreshTimeout = window.setTimeout(() => {
      idleRefreshTimeout = undefined;
      viewer.scene.requestRender();
    }, CAMERA_IDLE_REFRESH_DELAY_MS);
  };

  viewer.scene.postRender.addEventListener(() => {
    if (!refreshPending || cameraMoving || idleRefreshTimeout !== undefined) return;

    refreshPending = false;
    entityPositionManager.refreshTerrainPositions();
    viewer.scene.requestRender();
  });

  viewer.camera.moveStart.addEventListener(() => {
    cameraMoving = true;
    clearIdleRefresh();
  });

  viewer.camera.moveEnd.addEventListener(() => {
    cameraMoving = false;
    if (refreshPending) scheduleIdleRefresh();
  });

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    scheduleRefresh();
  });

  viewer.scene.globe.tileLoadProgressEvent.addEventListener((tilesLoading: number) => {
    if (tilesLoading === 0) scheduleRefresh();
  });

  const watchTileset = (primitive: unknown) => {
    if (!(primitive instanceof Cesium.Cesium3DTileset) || watchedTilesets.has(primitive)) return;

    watchedTilesets.add(primitive);
    scheduleRefresh();

    primitive.initialTilesLoaded.addEventListener(scheduleRefresh);
    primitive.allTilesLoaded.addEventListener(scheduleRefresh);
    primitive.loadProgress.addEventListener((pendingRequests: number, tilesProcessing: number) => {
      if (pendingRequests === 0 && tilesProcessing === 0) scheduleRefresh();
    });
  };

  for (let i = 0; i < viewer.scene.primitives.length; i++) {
    watchTileset(viewer.scene.primitives.get(i));
  }

  viewer.scene.primitives.primitiveAdded.addEventListener(watchTileset);
}
