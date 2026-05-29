/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import extractPlayerInfo from "./procedures/extractPlayerInfo";
import extractVersionString from "./procedures/extractVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import { logManager, LogLevel } from "./managers/logManager";
import { getPlayerInfo } from "./utils/player";

declare global {
  interface Window {
    logger: typeof logManager;
    iitcLogger: typeof logManager;
    LogLevel: typeof LogLevel;
  }
}

window.logger = logManager;
window.iitcLogger = logManager;
window.LogLevel = LogLevel;

const init = () => {
  logManager.setLevel(LogLevel.DEBUG);
  logManager.info("Initializing IITC Next");

  // Extract data from the original intel map
  extractVersionString();
  extractPlayerInfo();

  // Return if user isn't logged in
  if (!getPlayerInfo()) return;

  // Initialize IITC Next
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
