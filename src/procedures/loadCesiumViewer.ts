/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import { addLayerChooser } from "../interface/layerChooser";
import { getMapPosition, setCookie } from "../utils/browser";
import {
  generateTileKey,
  getDataZoomForMapZoom,
  getMapZoomTileParameters,
  latToTileIndex,
  lngToTileIndex,
  TileRequestManager
} from "../managers/tileRequestManager";
import { logManager } from "../managers/logManager";
import { EntityManager } from "../managers/entityManager";
import { DebugTileEntityManager } from "../managers/debugTileEntityManager";
import { showOrUpdateDetailBar } from "../interface/portalDetail";
import { addRefreshButton } from "../interface/refreshButton";
import { addGameDetailButton } from "../interface/gameDetail";
import { addCommDetailButton } from "../interface/commDetail";
import { AmapMercatorTilingScheme } from "../utils/map";
import { CommManager } from "../managers/commManager";
import { ScoreManager } from "../managers/scoreManager";
import { RedeemManager } from "../managers/redeemManager";
import { getPortalLayerId } from "../managers/portalEntityManager";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

// Height at zoom level 0, shows more tiles if higher
const HEIGHT_AT_ZOOM_ZERO = 96000000;

// Default tile limit to load
const MAX_TILES_TO_LOAD = 2000;

let lastDataZoom: number | undefined;
let lastTileKeysCount: number | undefined;

/**
 * Creates a Cesium container as an HTMLDivElement and appends it to the body.
 *
 * @return {HTMLDivElement} The newly created div element with id 'cesium-container' styled for full screen display.
 */
function createCesiumContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.id = "cesium-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "10000",
    backgroundColor: "black",
  });
  document.body.appendChild(container);
  return container;
}

/**
 * Sets up the viewer element and returns a new instance of Cesium.Viewer.
 *
 * @param containerId - The id of the DOM element to hold the viewer.
 */
function initCesiumViewer(containerId: string): Cesium.Viewer {
  const gaodeSatelliteViewModel = new Cesium.ProviderViewModel({
    name: "Gaode Satellite",
    iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingAerial.png"),
    tooltip: "Gaode Satellite Imagery",
    category: "Gaode",
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
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
        url: "https://webst02.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}",
        tilingScheme: new AmapMercatorTilingScheme({}),
        minimumLevel: 1,
        maximumLevel: 20,
        credit: new Cesium.Credit("Gaode", true)
      });
    }
  });

  const viewer = new Cesium.Viewer(containerId, {
    animation: false,
    timeline: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  // Remove some of the imagery layer options
  let models = viewer.baseLayerPicker.viewModel.imageryProviderViewModels;
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

  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(35);

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
  // which can bypass broken intermediate KTX2 levels on mobile
  viewer.scene.globe.maximumScreenSpaceError = 1.5;

  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
  viewer.scene.highDynamicRange = true;
  viewer.scene.msaaSamples = 4;
  viewer.resolutionScale = 2.0;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  const credits = document.querySelector(".cesium-widget-credits") as HTMLElement;
  if (credits) {
    credits.style.display = "none";
  }

  return viewer;
}

/**
 * Sets the initial view of Cesium to the map position from url params or cookies.
 *
 * @param viewer - The Cesium.Viewer instance to apply changes to.
 */
function setInitialView(viewer: Cesium.Viewer): void {
  const pos = getMapPosition();
  if (pos) {
    const height = HEIGHT_AT_ZOOM_ZERO / Math.pow(2, pos.zoom);
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(pos.lng, pos.lat, height),
    });
  }
}

/**
 * Set up event handlers on Cesium's screenSpaceEventHandler.
 *
 * @param viewer - The Cesium.Viewer instance to attach event handlers to.
 * @param entityManager - The entity manager object to use for retrieving portal data.
 * @param container - The HTMLDivElement element containing the cesium widget.
 */
function setupClickHandler(viewer: Cesium.Viewer, entityManager: EntityManager, container: HTMLElement): void {
  let isClickLoading = false;
  let isClickCancelled = false;
  let lastEntity: Cesium.Entity | undefined;
  const handler = viewer.screenSpaceEventHandler;

  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const pickedObjects = viewer.scene.drillPick(click.position);
    const entity = pickedObjects.find(
      (o) => o.id instanceof Cesium.Entity && (o.id as any).selectable !== false
    )?.id as Cesium.Entity | undefined;

    if (isClickLoading && lastEntity !== entity) {
      isClickCancelled = true;
    }
    lastEntity = entity;

    if (entity && entity.id.startsWith("portal-")) {
      isClickLoading = true;
      const portalGuid = entity.id.substring(7);
      const portalData = entityManager.getPortalData(portalGuid);
      if (portalData) {
        showOrUpdateDetailBar(container, portalData);
        entityManager.requestPortalDetails(portalGuid).then(() => {
          isClickLoading = false;
          if (isClickCancelled) {
            isClickCancelled = false;
            return;
          }
          const freshData = entityManager.getPortalData(portalGuid);
          if (freshData) {
            const layerId = getPortalLayerId(freshData);
            const source = entityManager.layerManager.getOrCreateSource(layerId);
            viewer.selectedEntity = source.entities.getById(`portal-${portalGuid}`);
            showOrUpdateDetailBar(container, freshData);
          }
        });
      }
    } else {
      viewer.selectedEntity = undefined;
      showOrUpdateDetailBar(container);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * Sets up Google Maps-like gestures:
 * Double-tap and drag to zoom.
 *
 * @param viewer - The Cesium.Viewer instance.
 */
function setupGoogleMapsGestures(viewer: Cesium.Viewer): void {
  const scene = viewer.scene;
  const handler = viewer.screenSpaceEventHandler;
  const controller = scene.screenSpaceCameraController;
  const doubleTapThreshold = 300; // ms
  let isDoubleTapping = false;
  let hasMovedDuringDoubleTap = false;
  let lastTapTime = 0;
  let lastMoveTime = 0;
  let zoomVelocity = 0;
  let momentumRequestId: number | null = null;
  let inertiaResetTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const stopMomentum = () => {
    if (momentumRequestId !== null) {
      cancelAnimationFrame(momentumRequestId);
      momentumRequestId = null;
    }
  };

  // Touch start callback
  handler.setInputAction(() => {
    stopMomentum();
    const now = Date.now();
    if (now - lastTapTime < doubleTapThreshold) {
      isDoubleTapping = true;
      hasMovedDuringDoubleTap = false;  // Reset hasMoved status
      controller.enableInputs = false;  // Disable default interactions
      lastTapTime = 0;  // Reset to avoid triple tap triggering it again
    } else {
      isDoubleTapping = false;
      hasMovedDuringDoubleTap = false;
      controller.enableInputs = true;
      lastTapTime = now;
    }
    if (inertiaResetTimeoutId !== null) {
      clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // Drag callbacks
  handler.setInputAction((movement: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 }) => {
    if (isDoubleTapping) {
      const now = Date.now();
      const dt = now - lastMoveTime;
      const dx = movement.endPosition.x - movement.startPosition.x;
      const dy = movement.endPosition.y - movement.startPosition.y;

      if (Math.sqrt(dx * dx + dy * dy) > 5) hasMovedDuringDoubleTap = true;

      // Disable momentum from default camera controller temporarily
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;

      if (dt > 0) {
        // Calculate velocity (pixels per ms)
        const currentVelocity = dy / dt;
        // Smoothing velocity
        zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
      }
      lastMoveTime = now;

      const height = viewer.camera.positionCartographic.height;
      const zoomFactor = height * 0.003;
      viewer.camera.zoomIn(dy * zoomFactor);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Touch end callback
  handler.setInputAction(() => {
    if (isDoubleTapping) {
      isDoubleTapping = false;

      if (!hasMovedDuringDoubleTap) {
        // Double tap without dragging: animated zoom in
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const targetHeight = height * 0.5;
        const destination = Cesium.Cartesian3.fromRadians(
          camera.positionCartographic.longitude,
          camera.positionCartographic.latitude,
          targetHeight
        );

        camera.flyTo({
          destination,
          duration: 0.5,
          complete: () => {
            controller.enableInputs = true;
          }
        });
      } else if (Math.abs(zoomVelocity) > 0.1) {
        // Apply momentum if velocity is significant
        let lastFrameTime = Date.now();
        const animateMomentum = () => {
          const now = Date.now();
          const dt = now - lastFrameTime;
          lastFrameTime = now;

          if (Math.abs(zoomVelocity) < 0.01) {
            controller.enableInputs = true;
            momentumRequestId = null;
            return;
          }

          const dy = zoomVelocity * dt;
          const camera = viewer.camera;
          const height = camera.positionCartographic.height;
          const zoomFactor = height * 0.003;
          camera.zoomIn(dy * zoomFactor);

          // Decelerate
          zoomVelocity *= 0.92;

          momentumRequestId = requestAnimationFrame(animateMomentum);
        };
        momentumRequestId = requestAnimationFrame(animateMomentum);
      } else {
        // Dragged but no significant momentum
        controller.enableInputs = true;
      }
    } else {
      controller.enableInputs = true;
    }

    // Restore move momentum after a while
    inertiaResetTimeoutId = setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      inertiaResetTimeoutId = null;
    }, 1000);
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

/**
 * Calculate the tile keys based on the current view.
 *
 * @param viewer - Viewer to calculaate.
 */
function calculateTileKeys(viewer: Cesium.Viewer): string[] {
  const camera = viewer.camera;
  const cartographic = camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lng = Cesium.Math.toDegrees(cartographic.longitude);
  const height = cartographic.height;

  const calculatedZoom = Math.round(Math.log2(HEIGHT_AT_ZOOM_ZERO / height));
  const mapZoom = isNaN(calculatedZoom) ? 0 : calculatedZoom;
  const dataZoom = getDataZoomForMapZoom(mapZoom);

  setCookie("ingress.intelmap.lat", lat.toFixed(6));
  setCookie("ingress.intelmap.lng", lng.toFixed(6));
  setCookie("ingress.intelmap.zoom", mapZoom.toString());

  const tileParams = getMapZoomTileParameters(dataZoom);
  const viewRect = camera.computeViewRectangle();

  if (viewRect) {
    const west = Cesium.Math.toDegrees(viewRect.west);
    const south = Cesium.Math.toDegrees(viewRect.south);
    const east = Cesium.Math.toDegrees(viewRect.east);
    const north = Cesium.Math.toDegrees(viewRect.north);

    const minX = lngToTileIndex(west, tileParams);
    const maxX = lngToTileIndex(east, tileParams);
    const minY = latToTileIndex(north, tileParams);
    const maxY = latToTileIndex(south, tileParams);

    const tileKeys: string[] = [];
    const tilesPerEdge = tileParams.tilesPerEdge;
    for (let x = minX; ; x = (x + 1) % tilesPerEdge) {
      for (let y = minY; y <= maxY; y++) {
        tileKeys.push(generateTileKey(tileParams, x, y));
        if (tileKeys.length >= MAX_TILES_TO_LOAD) {
          logManager.warn("CesiumViewer", "Too many tiles to load, truncating.");
          break;
        }
      }
      if (x === maxX || tileKeys.length >= MAX_TILES_TO_LOAD) break;
    }
    const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
    if (dataZoom <= 3 && lastDataZoom === dataZoom && tileKeys.length === lastTileKeysCount) {
      if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
        return [];
      }
    }

    lastDataZoom = dataZoom;
    lastTileKeysCount = tileKeys.length;

    return tileKeys;
  }

  return [];
}

/**
 * Trigger reloading of tiles.
 *
 * @param viewer - Cesium viewer to calculate view range.
 * @param tileRequestManager - Tile manager to add and process tiles.
 */
function triggerDataReload(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  const tileKeys = calculateTileKeys(viewer);

  if (tileKeys.length > 0) {
    tileRequestManager.removeTiles(tileKeys);
    tileRequestManager.addTiles(tileKeys, true);
  }
}

/**
 * Trigger loading of tiles.
 *
 * @param viewer - Cesium viewer to calculate view range.
 * @param tileRequestManager - Tile manager to add and process tiles.
 */
const triggerDataLoad = (viewer: Cesium.Viewer, tileRequestManager: TileRequestManager) => {
  const tileKeys = calculateTileKeys(viewer);

  if (tileKeys.length > 0) {
    tileRequestManager.addTiles(tileKeys);
  }
};

/**
 * Sets up data loading for the tile manager.
 *
 * @param viewer - The Cesium.Viewer instance to listen for camera changes.
 * @param tileRequestManager - The TileRequestManager instance to add tiles to.
 */
function setupDataLoading(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  viewer.camera.moveEnd.addEventListener(() => triggerDataLoad(viewer, tileRequestManager));
}

/**
 * Loads and initializes a Cesium viewer with necessary components.
 *
 * This function sets up the viewer by creating a container,
 * initializing the viewer, setting the initial view, managing entities,
 * tiles, debugging, adding a layer chooser, handling click events, and
 * setting up data loading.
 */
export default function loadCesiumViewer(): void {
  logManager.debug("CesiumViewer", "Loading");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  setInitialView(viewer);

  const entityManager = new EntityManager(viewer);
  const tileRequestManager = new TileRequestManager(entityManager);
  new DebugTileEntityManager(tileRequestManager, entityManager);

  const scoreManager = new ScoreManager();
  const redeemManager = new RedeemManager();
  const commManager = new CommManager(viewer);

  // Expose managers to the global iitc object
  window.iitc.viewer = viewer;
  window.iitc.entityManager = entityManager;
  window.iitc.tileRequestManager = tileRequestManager;
  window.iitc.scoreManager = scoreManager;
  window.iitc.redeemManager = redeemManager;
  window.iitc.commManager = commManager;

  addRefreshButton(container, () => triggerDataReload(viewer, tileRequestManager));
  addGameDetailButton(container, scoreManager, redeemManager);
  addCommDetailButton(viewer, container, commManager);

  addLayerChooser(container, entityManager);
  showOrUpdateDetailBar(container);
  logManager.setCallback((msg: string) => showOrUpdateDetailBar(container, msg));

  setupGoogleMapsGestures(viewer);
  setupClickHandler(viewer, entityManager, container);
  setupDataLoading(viewer, tileRequestManager);
}
