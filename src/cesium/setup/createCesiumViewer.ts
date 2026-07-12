/**
 * Initializes the Cesium viewer and base imagery configuration.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { logManager } from "../../managers/system/logManager";
import { settingsManager, type CesiumRenderQuality } from "../../managers/system/settingsManager";

const DEFAULT_BASE_LAYER_NAME = "OpenStreetMap";

// Tell Cesium where to find its assets (Images, Workers, etc.).
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

type CesiumRenderSettings = {
  globeMaximumScreenSpaceError: number;
  resolutionScale: number;
  msaaSamples: number;
  fxaaEnabled: boolean;
};

type Google3dTilesRenderSettings = {
  maximumScreenSpaceError: number;
  cacheBytes: number;
  maximumCacheOverflowBytes: number;
  cullWithChildrenBounds: boolean;
  dynamicScreenSpaceError: boolean;
  dynamicScreenSpaceErrorFactor: number;
  foveatedScreenSpaceError: boolean;
  foveatedMinimumScreenSpaceErrorRelaxation: number;
  skipLevelOfDetail: boolean;
  baseScreenSpaceError: number;
  skipScreenSpaceErrorFactor: number;
  skipLevels: number;
  immediatelyLoadDesiredLevelOfDetail: boolean;
  loadSiblings: boolean;
};

const DARKEN_GOOGLE_3D_TILES_STYLE = new Cesium.Cesium3DTileStyle({
  color: "color('#808080')",
});

const LOG_TAG = "InitCesiumViewer";

const CESIUM_RENDER_SETTINGS: Record<CesiumRenderQuality, CesiumRenderSettings> = {
  performance: {
    globeMaximumScreenSpaceError: 3,
    resolutionScale: 0.75,
    msaaSamples: 1,
    fxaaEnabled: false,
  },
  balanced: {
    globeMaximumScreenSpaceError: 1.5,
    resolutionScale: 1,
    msaaSamples: 1,
    fxaaEnabled: true,
  },
  high: {
    globeMaximumScreenSpaceError: 1,
    resolutionScale: 1.5,
    msaaSamples: 4,
    fxaaEnabled: false,
  },
  ultra: {
    globeMaximumScreenSpaceError: 0.75,
    resolutionScale: 2.0,
    msaaSamples: 4,
    fxaaEnabled: false,
  },
};

// Entity heights are sampled from loaded 3D Tile meshes. Keep refinement uniform
// across the whole view so a visual-quality optimization cannot remove the mesh
// beneath a portal; the tiers still differ by target SSE and memory budget.
const GOOGLE_3D_TILES_RENDER_SETTINGS: Record<CesiumRenderQuality, Google3dTilesRenderSettings> = {
  performance: {
    maximumScreenSpaceError: 16,
    cacheBytes: 384 * 1024 * 1024,
    maximumCacheOverflowBytes: 192 * 1024 * 1024,
    cullWithChildrenBounds: false,
    dynamicScreenSpaceError: false,
    dynamicScreenSpaceErrorFactor: 8,
    foveatedScreenSpaceError: false,
    foveatedMinimumScreenSpaceErrorRelaxation: 0,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
  },
  balanced: {
    maximumScreenSpaceError: 12,
    cacheBytes: 512 * 1024 * 1024,
    maximumCacheOverflowBytes: 256 * 1024 * 1024,
    cullWithChildrenBounds: false,
    dynamicScreenSpaceError: false,
    dynamicScreenSpaceErrorFactor: 8,
    foveatedScreenSpaceError: false,
    foveatedMinimumScreenSpaceErrorRelaxation: 0,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
  },
  high: {
    maximumScreenSpaceError: 10,
    cacheBytes: 640 * 1024 * 1024,
    maximumCacheOverflowBytes: 320 * 1024 * 1024,
    cullWithChildrenBounds: false,
    dynamicScreenSpaceError: false,
    dynamicScreenSpaceErrorFactor: 8,
    foveatedScreenSpaceError: false,
    foveatedMinimumScreenSpaceErrorRelaxation: 0,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 8,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
  },
  ultra: {
    maximumScreenSpaceError: 8,
    cacheBytes: 768 * 1024 * 1024,
    maximumCacheOverflowBytes: 384 * 1024 * 1024,
    cullWithChildrenBounds: false,
    dynamicScreenSpaceError: false,
    dynamicScreenSpaceErrorFactor: 8,
    foveatedScreenSpaceError: false,
    foveatedMinimumScreenSpaceErrorRelaxation: 0,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 8,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: true,
    loadSiblings: true,
  },
};

export function createCesiumViewer(container: HTMLElement, imageryProviderViewModels: Cesium.ProviderViewModel[] | undefined): Cesium.Viewer {
  const useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  const selectedImageryProviderViewModel = imageryProviderViewModels?.find(
    (viewModel) => viewModel.name === DEFAULT_BASE_LAYER_NAME,
  );

  const viewer = new Cesium.Viewer(container.id, {
    animation: false,
    timeline: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    baseLayer: false,
    baseLayerPicker: !useGoogle3dTiles,
    sceneModePicker: false,
    geocoder: useGoogle3dTiles ? Cesium.IonGeocodeProviderType.GOOGLE : undefined,
    imageryProviderViewModels,
    selectedImageryProviderViewModel,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  // Constraint the tilt angle
  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(90);

  // Set available tilt event types
  controller.tiltEventTypes = [
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.RIGHT_DRAG,
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.CTRL,
    },
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.SHIFT,
    },
  ];

  // Other options for the camera and scene to improve visual quality and performance
  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
  viewer.scene.globe.show = !useGoogle3dTiles;
  viewer.scene.highDynamicRange = true;

  const renderQuality = settingsManager.getCesiumRenderQuality();
  applyCesiumRenderSettings(viewer, CESIUM_RENDER_SETTINGS[renderQuality]);

  if (useGoogle3dTiles) {
    applyGoogle3dTilesSceneSettings(viewer);
    addGoogle3dTiles(viewer, GOOGLE_3D_TILES_RENDER_SETTINGS[renderQuality]).then();
  }

  return viewer;
}

function applyCesiumRenderSettings(viewer: Cesium.Viewer, renderSettings: CesiumRenderSettings): void {
  viewer.scene.globe.maximumScreenSpaceError = renderSettings.globeMaximumScreenSpaceError;
  viewer.scene.msaaSamples = renderSettings.msaaSamples;
  viewer.resolutionScale = renderSettings.resolutionScale;
  viewer.scene.postProcessStages.fxaa.enabled = renderSettings.fxaaEnabled;
}

function applyGoogle3dTilesSceneSettings(viewer: Cesium.Viewer): void {
  viewer.scene.highDynamicRange = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.001;
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
}

async function addGoogle3dTiles(viewer: Cesium.Viewer, renderSettings: Google3dTilesRenderSettings): Promise<void> {
  try {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({
      onlyUsingWithGoogleGeocoder: true,
    }, {
      maximumScreenSpaceError: renderSettings.maximumScreenSpaceError,
      cacheBytes: renderSettings.cacheBytes,
      maximumCacheOverflowBytes: renderSettings.maximumCacheOverflowBytes,
      cullWithChildrenBounds: renderSettings.cullWithChildrenBounds,
      dynamicScreenSpaceError: renderSettings.dynamicScreenSpaceError,
      dynamicScreenSpaceErrorDensity: 4.0e-4,
      dynamicScreenSpaceErrorFactor: renderSettings.dynamicScreenSpaceErrorFactor,
      dynamicScreenSpaceErrorHeightFalloff: 0.25,
      foveatedScreenSpaceError: renderSettings.foveatedScreenSpaceError,
      foveatedConeSize: 0.15,
      foveatedMinimumScreenSpaceErrorRelaxation: renderSettings.foveatedMinimumScreenSpaceErrorRelaxation,
      foveatedTimeDelay: 0.5,
      skipLevelOfDetail: renderSettings.skipLevelOfDetail,
      baseScreenSpaceError: renderSettings.baseScreenSpaceError,
      skipScreenSpaceErrorFactor: renderSettings.skipScreenSpaceErrorFactor,
      skipLevels: renderSettings.skipLevels,
      immediatelyLoadDesiredLevelOfDetail: renderSettings.immediatelyLoadDesiredLevelOfDetail,
      loadSiblings: renderSettings.loadSiblings,
      enableCollision: true,
    });
    if (settingsManager.getDarkenGoogle3dTiles()) {
      tileset.style = DARKEN_GOOGLE_3D_TILES_STYLE;
    }
    viewer.scene.primitives.add(tileset);
    viewer.scene.requestRender();
    logManager.debug(LOG_TAG, "Google 3D Tiles enabled");
  } catch (error) {
    viewer.scene.globe.show = true;
    viewer.scene.requestRender();
    logManager.error(LOG_TAG, "Failed to load Google 3D Tiles", error);
  }
}
