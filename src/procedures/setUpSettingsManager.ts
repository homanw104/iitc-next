/**
 * Set up the global settings manager.
 */

import { safeWindow } from "../utils/window.ts";
import { settingsManager } from "../managers/system/settingsManager.ts";

export default function setUpSettingsManager(): void {
  settingsManager.initialize();
  if (safeWindow) safeWindow.iitc.settingsManager = settingsManager;
}
