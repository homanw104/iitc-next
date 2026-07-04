/**
 * Set up the global API request manager.
 */

import { apiRequestManager } from "../managers/system/apiRequestManager.ts";
import { safeWindow } from "../utils/window.ts";

export default function setUpApiRequestManager(): void {
  apiRequestManager.initialize();
  if (safeWindow) safeWindow.iitc.apiRequestManager = apiRequestManager;
}
