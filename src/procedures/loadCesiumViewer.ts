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
  TileManager
} from "../managers/tileManager";
import { EntityManager } from "../managers/entityManager";
import { DebugTileManager } from "../managers/debugTileManager";
import { logger } from "../utils/logger";
import { hidePortalDetail, showPortalDetail } from "../interface/portalDetail";

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

  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(30);
  controller.enableLook = false;
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

  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
  viewer.scene.highDynamicRange = true;
  viewer.scene.msaaSamples = 4;
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
  const handler = viewer.screenSpaceEventHandler;
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const pickedObjects = viewer.scene.drillPick(click.position);
    const entity = pickedObjects.find(
      (p) => p.id instanceof Cesium.Entity && (p.id as any).selectable !== false
    )?.id as Cesium.Entity | undefined;

    if (entity && entity.id.startsWith("portal-")) {
      const guid = entity.id.substring(7);
      const portalData = entityManager.getPortalData(guid);
      if (portalData) {
        viewer.selectedEntity = entity;
        showPortalDetail(portalData, container);
        entityManager.requestPortalDetails(guid).then((freshData) => {
          if (viewer.selectedEntity?.id === `portal-${guid}`) {
            showPortalDetail(freshData, container);
          }
        });
      }
    } else {
      viewer.selectedEntity = undefined;
      hidePortalDetail();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * Sets up data loading for the tile manager.
 *
 * @param viewer - The Cesium.Viewer instance to listen for camera changes.
 * @param tileManager - The TileManager instance to add tiles to.
 */
function setupDataLoading(viewer: Cesium.Viewer, tileManager: TileManager): void {
  let lastDataZoom: number | undefined;
  let lastTileKeysCount: number | undefined;

  const triggerDataLoad = () => {
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
            logger.warn("CesiumViewer", "Too many tiles to load, truncating.");
            break;
          }
        }
        if (x === maxX || tileKeys.length >= MAX_TILES_TO_LOAD) break;
      }

      const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
      if (dataZoom <= 3 && lastDataZoom === dataZoom && tileKeys.length === lastTileKeysCount) {
        if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
          return;
        }
      }

      lastDataZoom = dataZoom;
      lastTileKeysCount = tileKeys.length;

      if (tileKeys.length > 0) {
        tileManager.addTiles(tileKeys);
      }
    }
  };

  viewer.camera.moveEnd.addEventListener(triggerDataLoad);
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
  logger.debug("CesiumViewer", "Loading...");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  setInitialView(viewer);

  const entityManager = new EntityManager(viewer);
  const tileManager = new TileManager(entityManager);
  new DebugTileManager(tileManager, entityManager);

  addLayerChooser(container, entityManager);
  setupClickHandler(viewer, entityManager, container);
  setupDataLoading(viewer, tileManager);
}
