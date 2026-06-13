/**
 * Keeps clamped portal billboards and label billboards aligned after terrain updates.
 */

import * as Cesium from "cesium";
import type { PortalEntityManager } from "../../managers/portalEntityManager";
import type { PortalLabelEntityManager } from "../../managers/portalLabelEntityManager";
import type { TileRequestManager } from "../../managers/tileRequestManager";

const REFRESH_FRAME_COUNT = 8;

export function setUpClampedPortalRefresh(
  viewer: Cesium.Viewer,
  portalEntityManager: PortalEntityManager,
  portalLabelEntityManager: PortalLabelEntityManager,
  tileRequestManager: TileRequestManager,
): void {
  let refreshFrames = 0;

  const scheduleRefresh = () => {
    refreshFrames = REFRESH_FRAME_COUNT;
    viewer.scene.requestRender();
  };

  viewer.scene.postRender.addEventListener(() => {
    if (refreshFrames <= 0) return;

    portalEntityManager.refreshClampedPortalGraphics();
    portalLabelEntityManager.refreshClampedLabelGraphics(
      (guid) => portalEntityManager.getPortalVisualPosition(guid));

    viewer.scene.requestRender();
    refreshFrames--;
  });

  viewer.camera.moveEnd.addEventListener(() => {
    scheduleRefresh();
  });

  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    scheduleRefresh();
  });

  viewer.scene.globe.tileLoadProgressEvent.addEventListener((tilesLoading: number) => {
    if (tilesLoading === 0) scheduleRefresh();
  });

  tileRequestManager.onTileStatusChange((_, status) => {
    if (status === "loaded") scheduleRefresh();
  });
}
