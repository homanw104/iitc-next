/**
 * Refreshes shared entity terrain-dependent state when the terrain provider changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entity/entityPositionManager";
import type { EntityTranslucencyManager } from "../../managers/entity/entityTranslucencyManager.ts";
import type { LoadingProgressManager } from "../../managers/system/loadingProgressManager.ts";

export function setUpEntityTerrainRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
  entityTranslucencyManager: EntityTranslucencyManager,
  loadingProgressManager: LoadingProgressManager,
): void {
  let terrainRefreshGeneration = 0;

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    const generation = ++terrainRefreshGeneration;

    entityPositionManager.clearSamplingWork();
    entityPositionManager.invalidateEntityPositions();
    entityTranslucencyManager.clearSamplingWork();
    entityTranslucencyManager.invalidateTerrainSample();

    loadingProgressManager.waitForGlobeTilesLoaded().then(() => {
      if (generation !== terrainRefreshGeneration) return;
      entityPositionManager.newSamplingWork();
      entityTranslucencyManager.newSamplingWork();
    });
  });
}
