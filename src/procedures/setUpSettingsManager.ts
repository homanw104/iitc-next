/**
 * Set up the global settings manager.
 */

import { settingsManager } from "../managers/system/settingsManager.ts";
import { safeWindow } from "../utils/window.ts";

export default function setUpSettingsManager(): void {
  settingsManager.initialize();
  if (safeWindow) safeWindow.iitc.settingsManager = settingsManager;
}
