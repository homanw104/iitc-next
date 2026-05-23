/**
 * Entry point for the application.
 */

import loadCesium from "./cesium";

const init = async () => {
  loadCesium();
};

// Wait for the page to load
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
