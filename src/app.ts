/**
 * Entry point for the application.
 */

import loadCesiumViewer from "./procedures/loadCesiumViewer";
import loadVersionString from "./procedures/loadVersionString";
import unloadOriginalIntelMap from "./procedures/unloadOriginalIntelMap";
import { logger, LogLevel } from "./utils/logger";

const init = async () => {
  logger.setLevel(LogLevel.NONE);
  logger.info("Initializing IITC");
  loadVersionString();
  unloadOriginalIntelMap();
  loadCesiumViewer();
};

if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
