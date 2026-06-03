/**
 * Simply sets up the global log manager.
 */

import { safeWindow } from "../utils/window";
import { logManager } from "../managers/logManager";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  if (safeWindow) (safeWindow as any).iitc.logManager = logManager;
}
