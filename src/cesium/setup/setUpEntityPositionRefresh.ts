/**
 * Refreshes shared entity terrain positions when the terrain provider changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entity/entityPositionManager";
import type { LoadingProgressManager } from "../../managers/system/loadingProgressManager.ts";

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
  loadingProgressManager: LoadingProgressManager,
): void {
  let terrainRefreshGeneration = 0;

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    const generation = ++terrainRefreshGeneration;

    entityPositionManager.clearSamplingWork();
    entityPositionManager.invalidateEntityPositions();
    
    loadingProgressManager.waitForGlobeTilesLoaded().then(() => {
      if (generation !== terrainRefreshGeneration) return;
      entityPositionManager.newSamplingWork();
    });
  });
}
