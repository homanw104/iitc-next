/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import { addLayerChooser } from "../interface/layerChooser";
import { getCookie, getURLParam, setCookie } from "../utils/browser";
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
import { MapPosition } from "../types/map";
import { logger } from "../utils/logger";
import { hidePortalDetail, showPortalDetail } from "../interface/portalDetail";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

// Default zoom level
const DEFAULT_ZOOM = 15;

// Height at zoom level 0, shows more tiles if higher
const HEIGHT_AT_ZOOM_ZERO = 96000000;

// Default tile limit to load
const MAX_TILES_TO_LOAD = 2000;

/**
 * Loads and initializes a Cesium viewer with specific configurations.
 * The viewer is placed in a container that covers the entire viewport,
 * and various UI elements are disabled for a cleaner interface. Initial view
 * settings are set based on a position, and entity and tile managers are initialized.
 * Additionally, an event listener is added to update cookies and fetch new data when
 * the camera moves.
 *
 * @return {void}
 */
export default function loadCesiumViewer(): void {
  logger.debug("CesiumViewer", "Loading...");

  // Create container div where the viewer will be placed
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

  // Initialize Cesium Viewer
  const viewer = new Cesium.Viewer(container.id, {
    animation: false,             // Disable the clock/animation widget
    timeline: false,              // Disable timeline
    homeButton: false,            // Disable home button
    navigationHelpButton: false,  // Disable navigation help button
    fullscreenButton: false,      // Disable full-screen button
    infoBox: false,               // Disable info box
    requestRenderMode: true,            // Performance: Only render when something changes
    maximumRenderTimeChange: Infinity,  // Ensure render only triggers on explicit changes or camera movement
  });

  // Limit pitch to avoid loading too many tiles at the horizon
  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(30);
  controller.enableLook = false; // "Look" bypasses tilt limits and is not recommended for map view
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

  // Performance & Quality Tweaks
  viewer.scene.logarithmicDepthBuffer = true; // Prevents Z-fighting at large distances
  viewer.scene.globe.showGroundAtmosphere = true; // Better visuals for the globe
  viewer.scene.globe.baseColor = Cesium.Color.BLACK; // Match our dark theme
  viewer.scene.highDynamicRange = true; // Better color reproduction

  // Enable Anti-aliasing
  // 4 samples is a good balance between quality and performance.
  viewer.scene.msaaSamples = 4;
  // FXAA is a post-processing antialiasing that works even on older hardware
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // Hide credit text at bottom of map
  const credits = document.querySelector(".cesium-widget-credits") as HTMLElement;
  if (credits) {
    Object.assign(credits.style, {
      display: "none"
    })
  }

  // Set initial view based on Intel map position
  const pos = getPosition();
  if (pos) {
    // Basic conversion from zoom level to height in meters.
    // Each zoom level halves the view distance.
    const height = HEIGHT_AT_ZOOM_ZERO / Math.pow(2, pos.zoom);

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(pos.lng, pos.lat, height),
    });
  }

  // Initialize Entity and Request Managers
  const entityManager = new EntityManager(viewer);
  const tileManager = new TileManager(entityManager);
  new DebugTileManager(tileManager, entityManager);

  // Add Layer Chooser UI
  addLayerChooser(container, entityManager);

  // Handle clicks on entities
  const handler = viewer.screenSpaceEventHandler;
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    const pickedObjects = viewer.scene.drillPick(click.position);
    // Find the first entity that is selectable (default true)
    const entity = pickedObjects.find(
      (p) => p.id instanceof Cesium.Entity && (p.id as any).selectable !== false
    )?.id as Cesium.Entity | undefined;

    if (entity && entity.id.startsWith("portal-")) {
      const guid = entity.id.substring(7);
      const portalData = entityManager.getPortalData(guid);
      if (portalData) {
        viewer.selectedEntity = entity;
        showPortalDetail(portalData, container);
      }
    } else {
      viewer.selectedEntity = undefined;
      hidePortalDetail();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Failsafe: ensure no non-selectable entity is ever selected
  viewer.selectedEntityChanged.addEventListener((entity) => {
    if (entity && (entity as any).selectable === false) {
      viewer.selectedEntity = undefined;
    }
  });

  // Remember last position and dataZoom for performance optimization
  let lastDataZoom: number | undefined;
  let lastTileKeysCount: number | undefined;

  // Trigger data load on move, zoom and at initial load
  const triggerDataLoad = () => {
    const camera = viewer.camera;
    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height;

    // Convert height back to zoom level
    const calculatedZoom = Math.round(Math.log2(HEIGHT_AT_ZOOM_ZERO / height));
    const mapZoom = isNaN(calculatedZoom) ? 0 : calculatedZoom;
    const dataZoom = getDataZoomForMapZoom(mapZoom);

    // Update cookies with current position
    setCookie("ingress.intelmap.lat", lat.toFixed(6));
    setCookie("ingress.intelmap.lng", lng.toFixed(6));
    setCookie("ingress.intelmap.zoom", mapZoom.toString());

    // Get tile parameters for current map zoom level
    const tileParams = getMapZoomTileParameters(dataZoom);

    // Calculate visible tile range
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

      logger.debug("CesiumViewer", `Zoom: map ${mapZoom}, data ${dataZoom}`);
      logger.debug("CesiumViewer", `Height: ${height.toFixed(0)}m`);
      logger.debug("CesiumViewer", `Tile range: X[${minX}-${maxX}], Y[${minY}-${maxY}]`);

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

      // Optimization: If dataZoom <= 3 and we've already tried to load all tiles for this zoom, skip.
      // At zoom <= 3, tilesPerEdge is typically 40, so 1600 tiles total.
      const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
      if (dataZoom <= 3 && lastDataZoom === dataZoom && tileKeys.length === lastTileKeysCount) {
        if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
          logger.debug("CesiumViewer", `Skipping redundant load for dataZoom ${dataZoom} (${tileKeys.length} tiles).`);
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

  // Update cookies and fetch new data when the camera moves
  viewer.camera.moveEnd.addEventListener(triggerDataLoad);
}

/**
 * Retrieves the last known map position from the URL parameters or cookies.
 * Prioritizes URL parameters over cookies. Return an object containing
 * the map's position and zoom level, or undefined if not found.
 *
 * @return {MapPosition?} - Position of the map or undefined if it cannot be found.
 */
function getPosition(): MapPosition | undefined {
  let lat: number, lng: number, zoom: number;

  const latE6 = getURLParam("latE6");
  const lngE6 = getURLParam("lngE6");
  const ll = getURLParam("ll") || getURLParam("pll");
  const z = getURLParam("z");
  const latCookie = getCookie("ingress.intelmap.lat");
  const lngCookie = getCookie("ingress.intelmap.lng");
  const zoomCookie = getCookie("ingress.intelmap.zoom");

  // Email URL params
  if (latE6 && lngE6 && z) {
    lat = parseInt(latE6) / 1e6;
    lng = parseInt(lngE6) / 1e6;
    zoom = parseInt(z);
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return undefined;
    return { lat, lng, zoom };
  }

  // Stock Intel URL params
  if (ll && z) {
    const parts = ll.split(",");
    lat = parseFloat(parts[0]);
    lng = parseFloat(parts[1]);
    zoom = parseInt(z);
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return undefined;
    return { lat, lng, zoom };
  }

  // Read from cookies
  if (latCookie && lngCookie) {
    lat = parseFloat(latCookie);
    lng = parseFloat(lngCookie);
    const parsedZoom = parseInt(zoomCookie || DEFAULT_ZOOM.toString());
    zoom = isNaN(parsedZoom) ? DEFAULT_ZOOM : parsedZoom;
    if (isNaN(lat) || isNaN(lng)) return undefined;
    return { lat, lng, zoom };
  }

  return undefined;
}
