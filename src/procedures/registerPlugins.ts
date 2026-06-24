/**
 * Register official plugins and expose the pluginManager for other scripts to register themselves.
 */

import { pluginManager } from "../managers/system/pluginManager";
import { safeWindow } from "../utils/window";

export default async function registerPlugins() {
  if (safeWindow) safeWindow.iitc.pluginManager = pluginManager;
  await pluginManager.initialize();

  // Import official plugins
  await import("../plugins/playerActivity.tsx");
  await import("../plugins/drawLines.tsx");
  await import("../plugins/crossLines.tsx");
  await import("../plugins/doneLines.tsx");
}
