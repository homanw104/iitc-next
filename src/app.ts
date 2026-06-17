/**
 * Entry point of the application.
 */

import { safeWindow } from "./utils/window";
import { safeLocalStorage } from "./utils/storage";
import setUpLogManager from "./procedures/setUpLogManager";
import setUpSettingsManager from "./procedures/setUpSettingsManager.ts";
import extractPlayerInfo from "./procedures/extractPlayerInfo";
import extractVersionString from "./procedures/extractVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import setUpPluginManager from "./procedures/registerPlugins";
import initPlugins from "./procedures/initPlugins";
import { getPlayerInfo } from "./utils/player";
import "./types/iitc.ts";

let initStarted = false;

const init = async () => {
  if (initStarted) return;
  initStarted = true;

  // Initialize and shadow storage if needed
  await safeLocalStorage.initialize();
  safeLocalStorage.shadow();

  // Initialize iitc variable
  if (safeWindow) safeWindow.iitc = {};

  // Set up logging for this app
  setUpLogManager();

  // Load settings
  setUpSettingsManager();

  // Extract data from the original intel map
  extractVersionString();
  extractPlayerInfo();

  // Halt if user isn't logged in
  if (!getPlayerInfo()) {
    initStarted = false;
    return;
  }

  // Unload the original intel map
  unloadOriginalIntelMap();

  // Initialize Cesium
  loadCesiumViewer();

  // Load all plugins
  await setUpPluginManager();
  initPlugins();
};

// Disable vanilla JS
window.onload = function () {};
document.body.onload = function () {};

// Initialize once the DOM content is loaded
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
