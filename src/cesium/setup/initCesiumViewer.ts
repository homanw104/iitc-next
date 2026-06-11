/**
 * Initializes the Cesium viewer and base imagery configuration.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { AmapMercatorTilingScheme } from "../../utils/map";

// Tell Cesium where to find its assets (Images, Workers, etc.).
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

export function initCesiumViewer(container: string): Cesium.Viewer {
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
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  // Remove unused imagery layer options
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

  // Constraint the tilt angle
  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(35);

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
  viewer.scene.highDynamicRange = true;
  viewer.scene.msaaSamples = 4;
  viewer.resolutionScale = 2.0;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // Remove the credits widget
  const credits = document.querySelector(".cesium-widget-credits") as HTMLElement;
  if (credits) {
    credits.style.display = "none";
  }

  return viewer;
}
