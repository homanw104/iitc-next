/**
 * Initializes the Cesium viewer and base imagery configuration.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { logManager } from "../../managers/system/logManager";
import { settingsManager, type Google3dTilesRenderQuality } from "../../managers/system/settingsManager";
import { AmapMercatorTilingScheme } from "../../utils/map";

// Tell Cesium where to find its assets (Images, Workers, etc.).
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

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
  resolutionScale: number;
  msaaSamples: number;
  fxaaEnabled: boolean;
};

const DARKEN_GOOGLE_3D_TILES_STYLE = new Cesium.Cesium3DTileStyle({
  color: "color('#808080')",
});

const LOG_TAG = "InitCesiumViewer";

const GOOGLE_3D_TILES_RENDER_SETTINGS: Record<Google3dTilesRenderQuality, Google3dTilesRenderSettings> = {
  performance: {
    maximumScreenSpaceError: 32,
    cacheBytes: 256 * 1024 * 1024,
    maximumCacheOverflowBytes: 128 * 1024 * 1024,
    cullWithChildrenBounds: true,
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorFactor: 24,
    foveatedScreenSpaceError: true,
    foveatedMinimumScreenSpaceErrorRelaxation: 8,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
    resolutionScale: 0.75,
    msaaSamples: 1,
    fxaaEnabled: false,
  },
  balanced: {
    maximumScreenSpaceError: 24,
    cacheBytes: 384 * 1024 * 1024,
    maximumCacheOverflowBytes: 192 * 1024 * 1024,
    cullWithChildrenBounds: true,
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorFactor: 16,
    foveatedScreenSpaceError: true,
    foveatedMinimumScreenSpaceErrorRelaxation: 4,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 16,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
    resolutionScale: 1,
    msaaSamples: 1,
    fxaaEnabled: true,
  },
  high: {
    maximumScreenSpaceError: 12,
    cacheBytes: 512 * 1024 * 1024,
    maximumCacheOverflowBytes: 256 * 1024 * 1024,
    cullWithChildrenBounds: true,
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorFactor: 8,
    foveatedScreenSpaceError: false,
    foveatedMinimumScreenSpaceErrorRelaxation: 0,
    skipLevelOfDetail: false,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: 8,
    skipLevels: 0,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
    resolutionScale: 1.25,
    msaaSamples: 4,
    fxaaEnabled: false,
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
    resolutionScale: 1.5,
    msaaSamples: 4,
    fxaaEnabled: false,
  },
};

export function initCesiumViewer(container: string): Cesium.Viewer {
  const useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  const gaodeSatelliteViewModel = new Cesium.ProviderViewModel({
    name: "Gaode Satellite",
    iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingAerial.png"),
    tooltip: "Gaode Satellite Imagery",
    category: "Gaode",
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}",
        tilingScheme: new AmapMercatorTilingScheme({}),
        minimumLevel: 1,
        maximumLevel: 20,
        credit: new Cesium.Credit("Gaode", true)
      });
    }
  });

  const gaodeRoadViewModel = new Cesium.ProviderViewModel({
    name: "Gaode Road",
    iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingRoads.png"),
    tooltip: "Gaode Road Map",
    category: "Gaode",
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
        tilingScheme: new AmapMercatorTilingScheme({}),
        minimumLevel: 1,
        maximumLevel: 20,
        credit: new Cesium.Credit("Gaode", true)
      });
    }
  });

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    baseLayerPicker: !useGoogle3dTiles,
    sceneModePicker: !useGoogle3dTiles,
    geocoder: useGoogle3dTiles ? Cesium.IonGeocodeProviderType.GOOGLE : undefined,
    terrain: Cesium.Terrain.fromWorldTerrain(),
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  // Remove unused imagery layer options
  if (!useGoogle3dTiles) {
    const models = viewer.baseLayerPicker.viewModel.imageryProviderViewModels;
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels = models.filter((model) => {
      return model.name !== "Sentinel-2" &&
        model.name !== "Blue Marble" &&
        model.name !== "Earth at night" &&
        model.name !== "Azure Maps Aerial" &&
        model.name !== "Azure Maps Roads" &&
        model.name !== "Esri World Ocean" &&
        !model.name.startsWith("Stadia");
    });

    // Add Gaode imagery options to the base layer picker
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels.unshift(gaodeSatelliteViewModel, gaodeRoadViewModel);
  }

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

  // Force Cesium to load higher resolution tiles sooner,
  // which may bypass broken intermediate KTX2 levels on mobile
  viewer.scene.globe.maximumScreenSpaceError = 1.5;

  // Other options for the camera and scene to improve visual quality and performance
  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
  viewer.scene.globe.show = !useGoogle3dTiles;
  viewer.scene.highDynamicRange = true;
  viewer.scene.msaaSamples = 4;
  viewer.resolutionScale = 1.5;
  viewer.scene.postProcessStages.fxaa.enabled = false;  // No need if msaa is enabled. Turn off to improve performance

  if (useGoogle3dTiles) {
    const renderSettings = GOOGLE_3D_TILES_RENDER_SETTINGS[settingsManager.getGoogle3dTilesRenderQuality()];
    applyGoogle3dTilesRenderSettings(viewer, renderSettings);
    addGoogle3dTiles(viewer, renderSettings).then();
  }

  // Remove the credits widget
  const credits = document.querySelector(".cesium-widget-credits") as HTMLElement;
  if (credits) {
    credits.style.display = "none";
  }

  return viewer;
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
    logManager.error(LOG_TAG, "Failed to load Google 3D Tiles", error);
    viewer.scene.globe.show = true;
    viewer.scene.requestRender();
  }
}

function applyGoogle3dTilesRenderSettings(viewer: Cesium.Viewer, renderSettings: Google3dTilesRenderSettings): void {
  viewer.scene.highDynamicRange = false;
  viewer.scene.msaaSamples = renderSettings.msaaSamples;
  viewer.resolutionScale = renderSettings.resolutionScale;
  viewer.scene.postProcessStages.fxaa.enabled = renderSettings.fxaaEnabled;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.001;
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
}
