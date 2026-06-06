/**
 * Simply sets up the global log manager.
 */

import { safeWindow } from "../utils/window";
import { logManager } from "../managers/logManager";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  if (safeWindow) safeWindow.iitc.logManager = logManager;
}
