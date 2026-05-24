/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import loadVersionString from "./procedures/loadVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";

const init = async () => {
  loadVersionString();
  unloadOriginalIntelMap();
  loadCesiumViewer();
};

// Wait for the page to load
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
