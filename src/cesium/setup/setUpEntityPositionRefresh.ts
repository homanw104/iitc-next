/**
 * Refreshes shared entity terrain positions when terrain data changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entityPositionManager";
import { logManager } from "../../managers/logManager.ts";

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
): void {
  const watchedHeightTilesets = new WeakSet<Cesium.Cesium3DTileset>();

  const requestHeightRefresh = (resetHeightCache = false) => {
    if (!resetHeightCache && !entityPositionManager.hasRefreshableTerrainPositions()) return;

    const refreshed = resetHeightCache
      ? entityPositionManager.invalidateTerrainPositions()
      : entityPositionManager.refreshTerrainPositions();

    if (!refreshed) return;
    logManager.debug("EntityPositionRefresh", "Requested entity position refresh");
    viewer.scene.requestRender();
  };

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

    primitive.allTilesLoaded.addEventListener(() => requestHeightRefresh());
  };

  for (let i = 0; i < viewer.scene.primitives.length; i++) {
    watchHeightTileset(viewer.scene.primitives.get(i));
  }

  viewer.scene.primitives.primitiveAdded.addEventListener(watchHeightTileset);
}
