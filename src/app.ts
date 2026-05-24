/**
 * Entry point for the application.
 */

import unloadOriginalIntelMap from "./intel";
import loadCesium from "./cesium";

const init = async () => {
  unloadOriginalIntelMap();
  loadCesium();
};

// Wait for the page to load
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
