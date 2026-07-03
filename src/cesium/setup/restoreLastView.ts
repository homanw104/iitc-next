/**
 * Restores the saved base layer and positions the camera from Intel map state.
 */

import * as Cesium from "cesium";
import type { LoadingProgressManager } from "../../managers/system/loadingProgressManager.ts";
import { settingsManager } from "../../managers/system/settingsManager.ts";
import { HEIGHT_AT_ZOOM_ZERO } from "../../managers/tiles/tileRequestMath";
import { getMapPosition } from "../../utils/browser";

const BASE_LAYER_STORAGE_KEY = "iitc-next-base-layer";
const MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS = 200;

export function restoreLastView(
  viewer: Cesium.Viewer,
  loadingProgressManager: LoadingProgressManager,
): void {
  const useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  if (!useGoogle3dTiles) {
    const modelName = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
    const viewModel = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find((viewModel) => viewModel.name === modelName);
    if (viewModel) {
      viewer.baseLayerPicker.viewModel.selectedImagery = viewModel;
    } else {
      localStorage.removeItem(BASE_LAYER_STORAGE_KEY);
    }

    document.querySelectorAll(".cesium-baseLayerPicker-item").forEach((item) => {
      item.addEventListener("click", () => {
        const selectedImagery = viewer.baseLayerPicker.viewModel.selectedImagery;
        if (selectedImagery) localStorage.setItem(BASE_LAYER_STORAGE_KEY, selectedImagery.name);
      });
    });
  }

  const position = getMapPosition();
  if (position) {
    const height = Math.max(
      HEIGHT_AT_ZOOM_ZERO / Math.pow(2, position.zoom),
      MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS,
    );
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(position.lng, position.lat, height),
    });
    void keepRestoredCameraAboveTerrain(
      viewer,
      loadingProgressManager,
      Cesium.Cartographic.fromDegrees(position.lng, position.lat, height),
      useGoogle3dTiles,
    );
  }
}

async function keepRestoredCameraAboveTerrain(
  viewer: Cesium.Viewer,
  loadingProgressManager: LoadingProgressManager,
  restoredPosition: Cesium.Cartographic,
  useGoogle3dTiles: boolean,
): Promise<void> {
  const surfaceHeight = await getInitialSurfaceHeight(viewer, loadingProgressManager, restoredPosition, useGoogle3dTiles);
  if (
    surfaceHeight === undefined ||
    hasCameraMoved(viewer.camera, restoredPosition)
  ) return;

  const minimumHeight = surfaceHeight + MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS;
  if (restoredPosition.height >= minimumHeight) return;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromRadians(
      restoredPosition.longitude,
      restoredPosition.latitude,
      minimumHeight
    ),
  });
  viewer.scene.requestRender();
}

async function getInitialSurfaceHeight(
  viewer: Cesium.Viewer,
  loadingProgressManager: LoadingProgressManager,
  position: Cesium.Cartographic,
  useGoogle3dTiles: boolean,
): Promise<number | undefined> {
  await loadingProgressManager.waitForInitSceneLoaded();
  const positionToSample = new Cesium.Cartographic(position.longitude, position.latitude);

  if (useGoogle3dTiles) {
    return getRenderedGoogleTilesHeight(viewer.scene, positionToSample) ?? getRenderedSurfaceHeight(viewer.scene, positionToSample);
  }

  if (viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider) {
    return 0;
  }

  try {
    const [sampled] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [positionToSample]);
    const sampledHeight = getFiniteHeight(sampled?.height);
    if (sampledHeight !== undefined) return sampledHeight;
  } catch {
    return getRenderedSurfaceHeight(viewer.scene, position);
  }

  return getRenderedSurfaceHeight(viewer.scene, position);
}

function getRenderedSurfaceHeight(scene: Cesium.Scene, position: Cesium.Cartographic): number | undefined {
  if (scene.sampleHeightSupported) {
    try {
      const height = getFiniteHeight(scene.sampleHeight(position));
      if (height !== undefined) return height;
    } catch {
      return getFiniteHeight(scene.globe.getHeight(position));
    }
  }

  return getFiniteHeight(scene.globe.getHeight(position));
}

function getRenderedGoogleTilesHeight(scene: Cesium.Scene, position: Cesium.Cartographic): number | undefined {
  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return getFiniteHeight(sceneWithGetHeight.getHeight(position, Cesium.HeightReference.CLAMP_TO_3D_TILE));
}

function getFiniteHeight(height: number | undefined): number | undefined {
  return height !== undefined && Number.isFinite(height) ? height : undefined;
}

function hasCameraMoved(camera: Cesium.Camera, restoredPosition: Cesium.Cartographic): boolean {
  const currentPosition = camera.positionCartographic;
  const hasLngMoved = !Cesium.Math.equalsEpsilon(currentPosition.longitude, restoredPosition.longitude, Cesium.Math.EPSILON10);
  const hasLatMoved = !Cesium.Math.equalsEpsilon(currentPosition.latitude, restoredPosition.latitude, Cesium.Math.EPSILON10);
  const hasHeightMoved = Math.abs(currentPosition.height - restoredPosition.height) > 1;
  return hasLngMoved || hasLatMoved || hasHeightMoved;
}
