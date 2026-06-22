/**
 * Refreshes shared entity terrain positions when terrain data changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entityPositionManager";
import { logManager } from "../../managers/logManager.ts";

const CAMERA_IDLE_REFRESH_DELAY_MS = 200;

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
): void {
  let heightRefreshRequested = false;
  let heightCacheResetRequested = false;
  let cameraMoving = false;
  let interactionActive = false;
  let idleRefreshTimeout: ReturnType<typeof setTimeout> | undefined;
  const watchedHeightTilesets = new WeakSet<Cesium.Cesium3DTileset>();

  const requestHeightRefresh = (resetHeightCache = false) => {
    if (!resetHeightCache && !entityPositionManager.hasRefreshableTerrainPositions()) return;

    heightRefreshRequested = true;
    heightCacheResetRequested = heightCacheResetRequested || resetHeightCache;
    logManager.debug("EntityPositionRefresh", "Requested entity position refresh");
    scheduleIdleHeightRefresh();
  };

  const scheduleIdleHeightRefresh = () => {
    clearIdleRefresh();

    if (cameraMoving || interactionActive) return;

    idleRefreshTimeout = setTimeout(() => {
      idleRefreshTimeout = undefined;
      viewer.scene.requestRender();
    }, CAMERA_IDLE_REFRESH_DELAY_MS);
  };

  const clearIdleRefresh = () => {
    if (idleRefreshTimeout === undefined) return;

    clearTimeout(idleRefreshTimeout);
    idleRefreshTimeout = undefined;
  };

  viewer.scene.postRender.addEventListener(() => {
    if (!heightRefreshRequested || cameraMoving || interactionActive || idleRefreshTimeout !== undefined) return;

    const refreshed = heightCacheResetRequested
      ? entityPositionManager.invalidateTerrainPositions()
      : entityPositionManager.refreshTerrainPositions();

    if (!refreshed) {
      scheduleIdleHeightRefresh();
      return;
    }

    heightRefreshRequested = false;
    heightCacheResetRequested = false;
    viewer.scene.requestRender();
  });

  const handleInteractionStart = () => {
    interactionActive = true;
    clearIdleRefresh();
    entityPositionManager.suppressHeightSampling();
  };

  const handleInteractionEnd = () => {
    if (!interactionActive) return;

    interactionActive = false;
    entityPositionManager.resumeHeightSampling();
    if (heightRefreshRequested) scheduleIdleHeightRefresh();
  };

  viewer.scene.canvas.addEventListener("pointerdown", handleInteractionStart, { passive: true });
  viewer.scene.canvas.addEventListener("mousedown", handleInteractionStart, { passive: true });
  viewer.scene.canvas.addEventListener("touchstart", handleInteractionStart, { passive: true });
  window.addEventListener("pointerup", handleInteractionEnd, { passive: true });
  window.addEventListener("pointercancel", handleInteractionEnd, { passive: true });
  window.addEventListener("mouseup", handleInteractionEnd, { passive: true });
  window.addEventListener("touchend", handleInteractionEnd, { passive: true });
  window.addEventListener("touchcancel", handleInteractionEnd, { passive: true });
  window.addEventListener("blur", handleInteractionEnd);

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
