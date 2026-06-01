/**
 * Simply sets up the global log manager.
 */

import { logManager } from "../managers/logManager";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  logManager.info("Initializing IITC Next");
  window.iitc.logManager = logManager;
}
