/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import extractVersionString from "./procedures/extractVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import { logManager, LogLevel } from "./managers/logManager";
import { Player } from "./types/ingress";

declare global {
  interface Window {
    logger: typeof logManager;
    iitcLogger: typeof logManager;
    LogLevel: typeof LogLevel;
    PLAYER?: Player;
  }
}

window.logger = logManager;
window.iitcLogger = logManager;
window.LogLevel = LogLevel;

const init = () => {
  logManager.setLevel(LogLevel.INFO);
  logManager.info("Initializing IITC Next");

  // Skip initializing if not logged in
  if (!window.PLAYER || !window.PLAYER.nickname) {
    logManager.warn("User not logged in. Skipping initialization.");

    if (document.getElementById("header_email")) {
      // Ingress Intel page seems to be in a weird state, it has email but no player data
      logManager.error("Logged in but page doesn't have player data");
    }

    return;
  }

  // Initialize IITC Next
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
