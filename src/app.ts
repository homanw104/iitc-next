/**
 * Entry point of the application.
 */

import { safeWindow } from "./utils/window";
import { safeLocalStorage } from "./utils/storage";
import extractVersionString from "./procedures/extractVersionString";
import setUpLogManager from "./procedures/setUpLogManager";
import setUpSettingsManager from "./procedures/setUpSettingsManager.ts";
import setUpPlayerInfoManager from "./procedures/setUpPlayerInfoManager.ts";
import getLoginStatus from "./procedures/getLoginStatus.ts";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import registerPlugins from "./procedures/registerPlugins";
import initPlugins from "./procedures/initPlugins";
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

  // Extract data from the original intel map
  extractVersionString();

  // Set up logging for this app
  setUpLogManager();

  // Load settings for this app
  setUpSettingsManager();

  // Extract player info
  setUpPlayerInfoManager();

  // Halt if user isn't logged in
  if (!getLoginStatus()) {
    initStarted = false;

    // Modify the login page
    return;

  } else {
    // Unload the original intel map
    unloadOriginalIntelMap();

    // Initialize Cesium
    const managers = loadCesiumViewer();

    // Load all plugins
    await registerPlugins();
    initPlugins(managers.layerManager);
  }
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
