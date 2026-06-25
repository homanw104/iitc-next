/**
 * Restores the saved base layer and positions the camera from Intel map state.
 */

import * as Cesium from "cesium";
import { settingsManager } from "../../managers/system/settingsManager.ts";
import { HEIGHT_AT_ZOOM_ZERO } from "../../managers/tiles/tileRequestMath";
import { getMapPosition } from "../../utils/browser";

const BASE_LAYER_STORAGE_KEY = "iitc-next-base-layer";
const MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS = 200;

export function restoreLastView(viewer: Cesium.Viewer): void {
  const useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  if (!useGoogle3dTiles) {
    const modelName = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
    const viewModel = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find(m => m.name === modelName);
    if (viewModel) viewer.baseLayerPicker.viewModel.selectedImagery = viewModel;
    document.querySelectorAll(".cesium-baseLayerPicker-item").forEach((item) => {
      item.addEventListener("click", () => {
        localStorage.setItem(BASE_LAYER_STORAGE_KEY, viewer.baseLayerPicker.viewModel.selectedImagery.name);
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
    keepRestoredCameraAboveTerrain(viewer, position.lng, position.lat, height, useGoogle3dTiles).then();
  }
}

async function keepRestoredCameraAboveTerrain(
  viewer: Cesium.Viewer,
  restoredLng: number,
  restoredLat: number,
  restoredHeight: number,
  useGoogle3dTiles: boolean,
): Promise<void> {
  const restoredPosition = Cesium.Cartographic.fromDegrees(restoredLng, restoredLat, restoredHeight);
  const surfaceHeight = await getInitialSurfaceHeight(viewer, restoredPosition, useGoogle3dTiles);
  if (surfaceHeight === undefined || hasCameraMoved(viewer.camera, restoredPosition)) return;

  const minimumHeight = surfaceHeight + MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS;
  if (restoredHeight >= surfaceHeight + MINIMUM_RESTORED_CAMERA_GROUND_CLEARANCE_METERS) return;

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
  position: Cesium.Cartographic,
  useGoogle3dTiles: boolean,
): Promise<number | undefined> {
  await waitForInitialTerrain(viewer, useGoogle3dTiles);
  const positionToSample = new Cesium.Cartographic(position.longitude, position.latitude);

  if (viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider) {
    return 0;
  }

  try {
    const [sampled] = useGoogle3dTiles
      ? await viewer.scene.sampleHeightMostDetailed([positionToSample])
      : await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [positionToSample]);
    if (sampled?.height !== undefined) return sampled.height;
  } catch {
    return getRenderedSurfaceHeight(viewer.scene, position);
  }

  return getRenderedSurfaceHeight(viewer.scene, position);
}

function waitForInitialTerrain(viewer: Cesium.Viewer, useGoogle3dTiles: boolean): Promise<void> {
  if (isInitialTerrainReady(viewer, useGoogle3dTiles)) return Promise.resolve();

  return new Promise((resolve) => {
    const removePostRenderListener = viewer.scene.postRender.addEventListener(() => {
      if (!isInitialTerrainReady(viewer, useGoogle3dTiles)) return;
      removePostRenderListener();
      resolve();
    });
    viewer.scene.requestRender();
  });
}

function isInitialTerrainReady(viewer: Cesium.Viewer, useGoogle3dTiles: boolean): boolean {
  if (useGoogle3dTiles) {
    return viewer.scene.globe.show || getScene3dTileset(viewer.scene)?.tilesLoaded === true;
  } else {
    return viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider || viewer.scene.globe.tilesLoaded;
  }
}

function getRenderedSurfaceHeight(scene: Cesium.Scene, position: Cesium.Cartographic): number | undefined {
  if (scene.sampleHeightSupported) {
    try {
      const height = scene.sampleHeight(position);
      if (height !== undefined) return height;
    } catch {
      return scene.globe.getHeight(position);
    }
  }

  return scene.globe.getHeight(position);
}

function hasCameraMoved(camera: Cesium.Camera, restoredPosition: Cesium.Cartographic): boolean {
  const currentPosition = camera.positionCartographic;
  const hasLngMoved = !Cesium.Math.equalsEpsilon(currentPosition.longitude, restoredPosition.longitude, Cesium.Math.EPSILON10);
  const hasLatMoved = !Cesium.Math.equalsEpsilon(currentPosition.latitude, restoredPosition.latitude, Cesium.Math.EPSILON10);
  const hasHeightMoved = Math.abs(currentPosition.height - restoredPosition.height) > 1;
  return hasLngMoved || hasLatMoved || hasHeightMoved;
}

function getScene3dTileset(scene: Cesium.Scene): Cesium.Cesium3DTileset | undefined {
  for (let i = 0; i < scene.primitives.length; i++) {
    const primitive = scene.primitives.get(i);
    if (primitive instanceof Cesium.Cesium3DTileset) return primitive;
  }

  return undefined;
}
