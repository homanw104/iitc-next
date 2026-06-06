/**
 * Register official plugins and expose the pluginManager for other scripts to register themselves.
 */

import { safeWindow } from "../utils/window";
import { pluginManager } from "../managers/pluginManager";

export default async function registerPlugins() {
  if (safeWindow) safeWindow.iitc.pluginManager = pluginManager;
  await pluginManager.initialize();

  // Import official plugins
  await import("../plugins/playerActivity.tsx");
}
