/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Viewer, Cartesian3 } from "cesium";
import { getPosition } from "./map";
import { setCookie } from "./utils";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

/**
 * Load the Cesium library and initialize a Viewer.
 */
export default function loadCesium(): Viewer {
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
      destination: Cartesian3.fromDegrees(pos.center[1], pos.center[0], height),
    });
  }

  // Update cookies when the camera moves
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

    setCookie("ingress.intelmap.lat", lat.toFixed(6));
    setCookie("ingress.intelmap.lng", lng.toFixed(6));
    setCookie("ingress.intelmap.zoom", zoom.toString());
  });

  return viewer;
}
