import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
(window as any).CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/";

const init = async () => {
  // Create container div where the viewer will be placed
  const container = document.createElement("div");
  container.id = "cesiumContainer";
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
  new Cesium.Viewer("cesiumContainer", {
    terrainProvider: await Cesium.createWorldTerrainAsync(),
    baseLayerPicker: false,
    geocoder: false,
  });
};

// Wait for the page to load
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
