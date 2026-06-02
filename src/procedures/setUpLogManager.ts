/**
 * Simply sets up the global log manager.
 */

import { logManager } from "../managers/logManager";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  window.iitc.logManager = logManager;
}
