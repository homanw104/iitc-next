/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Viewer, Cartesian3 } from "cesium";
import { getCookie, getURLParam, setCookie } from "../utils/browser";
import { generateTileId, getMapZoomTileParameters, latToTileIndex, lngToTileIndex, TileRequestManager } from "../utils/tiles";
import { EntityManager } from "../utils/entity_manager";
import { MapPosition } from "../types/map";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

// Default zoom level
const DEFAULT_ZOOM = 15;

/**
 * Load the Cesium library and initialize a Viewer.
 */
export default function loadCesiumViewer(): Viewer {
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
  });

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
    // Basic conversion from zoom level to height in meters
    // At zoom 0, the earth is roughly 20,000,000 meters wide.
    // Each zoom level halves the view distance.
    const height = 40000000 / Math.pow(2, pos.zoom);

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(pos.lng, pos.lat, height),
    });
  }

  // Initialize Entity and Request Managers
  const entityManager = new EntityManager(viewer);
  const requestManager = new TileRequestManager(entityManager);

  // Update cookies and fetch new data when the camera moves
  viewer.camera.moveEnd.addEventListener(() => {
    const camera = viewer.camera;
    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height;

    // Convert height back to zoom level
    // height = 40000000 / Math.pow(2, zoom)
    // Math.pow(2, zoom) = 40000000 / height
    // zoom = log2(40000000 / height)
    const zoom = Math.round(Math.log2(40000000 / height));

    // Update cookies with current position
    setCookie("ingress.intelmap.lat", lat.toFixed(6));
    setCookie("ingress.intelmap.lng", lng.toFixed(6));
    setCookie("ingress.intelmap.zoom", zoom.toString());

    // Get tile parameters for current map zoom level
    const params = getMapZoomTileParameters(zoom);

    // Calculate visible tile range
    const viewRect = camera.computeViewRectangle();

    if (viewRect) {
      const west = Cesium.Math.toDegrees(viewRect.west);
      const south = Cesium.Math.toDegrees(viewRect.south);
      const east = Cesium.Math.toDegrees(viewRect.east);
      const north = Cesium.Math.toDegrees(viewRect.north);

      const minX = lngToTileIndex(west, params);
      const maxX = lngToTileIndex(east, params);
      const minY = latToTileIndex(north, params);
      const maxY = latToTileIndex(south, params);

      const tileKeys: string[] = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tileKeys.push(generateTileId(params, x, y));
        }
      }

      if (tileKeys.length > 0) {
        requestManager.addTiles(tileKeys);
      }
    }
  });

  return viewer;
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
    return { lat, lng, zoom };
  }

  // Stock Intel URL params
  if (ll && z) {
    lat = parseFloat(ll.split(",")[0]);
    lng = parseFloat(ll.split(",")[1]);
    zoom = parseInt(z);
    return { lat, lng, zoom };
  }

  // Read from cookies
  if (latCookie && lngCookie) {
    lat = parseFloat(latCookie);
    lng = parseFloat(lngCookie);
    zoom = parseInt(zoomCookie || DEFAULT_ZOOM.toString());
    return { lat, lng, zoom };
  }

  return undefined;
}
