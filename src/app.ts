/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import loadVersionString from "./procedures/loadVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import { logger, LogLevel } from "./utils/logger";

// @ts-expect-error - exposing logger to window for easier debugging
window.logger = logger;
// @ts-expect-error - exposing LogLevel to window
window.LogLevel = LogLevel;

const init = () => {
  logger.setLevel(LogLevel.DEBUG);
  logger.info("Initializing IITC");
  loadVersionString();
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
