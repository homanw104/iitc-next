/**
 * Entry point of the application.
 */

import { unsafeWindow } from "vite-plugin-monkey/dist/client";
import setUpLogManager from "./procedures/setUpLogManager";
import extractPlayerInfo from "./procedures/extractPlayerInfo";
import extractVersionString from "./procedures/extractVersionString";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import setUpPluginManager from "./procedures/registerPlugins";
import initPlugins from "./procedures/initPlugins";
import { getPlayerInfo } from "./utils/player";
import "./types/iitc.ts";

const init = async () => {
  // Initialize iitc variable
  unsafeWindow.iitc = {};

  // Set up logging for this app
  setUpLogManager();

  // Extract data from the original intel map
  extractVersionString();
  extractPlayerInfo();

  // Halt if user isn't logged in
  if (!getPlayerInfo()) return;

  // Initialize IITC Next
  unloadOriginalIntelMap();
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
