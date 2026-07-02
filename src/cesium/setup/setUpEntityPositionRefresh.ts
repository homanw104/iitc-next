/**
 * Refreshes shared entity terrain positions when the terrain provider changes.
 */

import * as Cesium from "cesium";
import type { EntityPositionManager } from "../../managers/entity/entityPositionManager";

export function setUpEntityPositionRefresh(
  viewer: Cesium.Viewer,
  entityPositionManager: EntityPositionManager,
): void {
  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    entityPositionManager.clearSamplingWork();
    entityPositionManager.newSamplingWork();
  });
}
