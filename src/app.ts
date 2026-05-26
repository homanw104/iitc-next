/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import extractVersionString from "./procedures/extractVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import { logger, LogLevel } from "./utils/logger";

// @ts-expect-error - exposing logManager to window for easier debugging
window.logger = logger;
// @ts-expect-error - also expose as iitcLogger
window.iitcLogger = logger;
// @ts-expect-error - exposing LogLevel to window
window.LogLevel = LogLevel;

const init = () => {
  logger.setLevel(LogLevel.INFO);
  logger.info("Initializing IITC Next");
  extractVersionString();
  unloadOriginalIntelMap();
  loadCesiumViewer();
};

// Disable vanilla JS
window.onload = function () {};
document.body.onload = function () {};

// Initialize once the DOM content is loaded
if (document.readyState === "complete") {
  init();
} else {
  window.addEventListener("load", init);
}
