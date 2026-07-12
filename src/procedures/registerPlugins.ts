/**
 * Register official plugins and expose the pluginManager for other scripts to register themselves.
 */

import { pluginManager } from "../managers/system/pluginManager";
import { safeWindow } from "../utils/window";

export default async function registerPlugins() {
  if (safeWindow) safeWindow.iitc.pluginManager = pluginManager;
  await pluginManager.initialize();

  // Import official plugins
  await import("../plugins/playerActivity/plugin");
  await import("../plugins/drawLines/plugin");
  await import("../plugins/crossLines/plugin");
  await import("../plugins/doneLines/plugin");
}
