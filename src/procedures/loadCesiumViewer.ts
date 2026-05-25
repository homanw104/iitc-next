/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import { getCookie, getURLParam, setCookie } from "../utils/browser";
import { generateTileKey, getMapZoomTileParameters, latToTileIndex, lngToTileIndex, TileManager } from "../managers/tileManager";
import { EntityManager } from "../managers/entityManager";
import { MapPosition } from "../types/map";
import { logger } from "../utils/logger";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

// Default zoom level
const DEFAULT_ZOOM = 15;

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
    contextOptions: {
      allowTextureFilterAnisotropic: true,
    },
    requestRenderMode: true,            // Performance: Only render when something changes
    maximumRenderTimeChange: Infinity,  // Ensure render only triggers on explicit changes or camera movement
  });

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
  const tileManager = new TileManager(entityManager);

  // Add Layer Chooser UI
  addLayerChooser(container, entityManager);

  const triggerDataLoad = () => {
    const camera = viewer.camera;
    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height;

    // Convert height back to zoom level
    const zoom = Math.round(Math.log2(40000000 / height));

    // Update cookies with current position
    setCookie("ingress.intelmap.lat", lat.toFixed(6));
    setCookie("ingress.intelmap.lng", lng.toFixed(6));
    setCookie("ingress.intelmap.zoom", zoom.toString());

    // Get tile parameters for current map zoom level
    const tileParams = getMapZoomTileParameters(zoom);

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

      logger.debug("CesiumViewer", `Zoom: ${zoom}`);
      logger.debug("CesiumViewer", `Height: ${height.toFixed(0)}m`);
      logger.debug("CesiumViewer", `View: [W:${west}, S:${south}, E:${east}, N:${north}]`);
      logger.debug("CesiumViewer", `Tile range: X[${minX}-${maxX}], Y[${minY}-${maxY}]`);

      const tileKeys: string[] = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          tileKeys.push(generateTileKey(tileParams, x, y));
        }
      }

      if (tileKeys.length > 0) {
        tileManager.addTiles(tileKeys);
      }
    }
  };

  // Update cookies and fetch new data when the camera moves
  viewer.camera.moveEnd.addEventListener(triggerDataLoad);

  // Initial data load
  triggerDataLoad();
}

/**
 * Adds a layer chooser button and dropdown to the specified container.
 *
 * @param container - The HTML element where the layer chooser will be appended.
 * @param entityManager - An instance of EntityManager that manages layer visibility.
 */
function addLayerChooser(container: HTMLElement, entityManager: EntityManager): void {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, {
    position: "absolute",
    bottom: "5px",
    right: "5px",
    padding: "2px",
    zIndex: "10010",
    display: "flex",
    flexDirection: "column-reverse",
    alignItems: "flex-end"
  });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "cesium-button cesium-toolbar-button";
  button.title = "Layer Chooser";
  button.innerHTML = `
    <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
      <path d="M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z" />
    </svg>
  `;

  const chooser = document.createElement("div");
  Object.assign(chooser.style, {
    backgroundColor: "rgba(42, 42, 42, 0.9)",
    padding: "10px",
    borderRadius: "4px",
    color: "white",
    fontFamily: "sans-serif",
    fontSize: "13px",
    boxShadow: "0 0 10px rgba(0,0,0,0.5)",
    border: "1px solid #555",
    display: "none",
    minWidth: "100px"
  });

  button.onclick = () => {
    chooser.style.display = chooser.style.display === "none" ? "block" : "none";
  };

  const title = document.createElement("div");
  title.innerText = "Layers";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "8px";
  title.style.borderBottom = "1px solid #555";
  title.style.paddingBottom = "4px";
  chooser.appendChild(title);

  const portalLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const teams = ["ENLIGHTENED", "RESISTANCE", "MACHINA", "NEUTRAL"];

  const layers: Array<{ id: string; label: string }> = [
    { id: "portals-placeholder", label: "Portals (Uncharged)" },
  ];

  teams.forEach(team => {
    const teamLabel = team.charAt(0).toUpperCase() + team.slice(1).toLowerCase();
    layers.push({ id: `fields-${team.toLowerCase()}`, label: `${teamLabel} Fields` });
    layers.push({ id: `links-${team.toLowerCase()}`, label: `${teamLabel} Links` });
  });

  portalLevels.forEach(level => {
    teams.forEach(team => {
      const teamLabel = team.charAt(0).toUpperCase() + team.slice(1).toLowerCase();
      layers.push({
        id: `portals-l${level}-${team.toLowerCase()}`,
        label: `L${level} ${teamLabel} Portal`
      });
    });
  });

  layers.forEach(layer => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.marginBottom = "4px";
    label.style.cursor = "pointer";
    label.style.whiteSpace = "nowrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = entityManager.isLayerVisible(layer.id);
    checkbox.style.marginRight = "8px";
    checkbox.style.verticalAlign = "middle";
    checkbox.addEventListener("change", (e) => {
      entityManager.setLayerVisible(layer.id, (e.target as HTMLInputElement).checked);
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(layer.label));
    chooser.appendChild(label);
  });

  wrapper.appendChild(button);
  wrapper.appendChild(chooser);
  container.appendChild(wrapper);
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
