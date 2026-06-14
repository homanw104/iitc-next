/**
 * Refreshes shared entity terrain positions when terrain data changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entityPositionManager";

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
): void {
  let refreshPending = false;

  const scheduleRefresh = () => {
    refreshPending = true;
    viewer.scene.requestRender();
  };

  viewer.scene.postRender.addEventListener(() => {
    if (!refreshPending) return;

    refreshPending = false;
    entityPositionManager.refreshTerrainPositions();
    viewer.scene.requestRender();
  });

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    scheduleRefresh();
  });

  viewer.scene.globe.tileLoadProgressEvent.addEventListener((tilesLoading: number) => {
    if (tilesLoading === 0) scheduleRefresh();
  });
}
