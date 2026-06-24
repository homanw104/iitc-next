/**
 * Simply sets up the global log manager.
 */

import { logManager } from "../managers/system/logManager";
import { safeWindow } from "../utils/window";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  if (safeWindow) safeWindow.iitc.logManager = logManager;
}
