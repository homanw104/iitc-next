/**
 * Entry point for the application.
 */

import setUpLogManager from "./procedures/setUpLogManager";
import extractPlayerInfo from "./procedures/extractPlayerInfo";
import extractVersionString from "./procedures/extractVersionString";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import loadPlugins from "./procedures/loadPlugins";
import registerPlugins from "./procedures/registerPlugins";
import { getPlayerInfo } from "./utils/player";
import "./types/iitc.d.ts";

const init = () => {
  // Initialize iitc variable
  window.iitc = {}

  // Set up logging for this app
  setUpLogManager();

  // Register plugins and expose registration function globally
  registerPlugins();

  // Extract data from the original intel map
  extractVersionString();
  extractPlayerInfo();

  // Halt if user isn't logged in
  if (!getPlayerInfo()) return;

  // Initialize IITC Next
  unloadOriginalIntelMap();
  loadCesiumViewer();

  // Load all plugins
  loadPlugins();
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
