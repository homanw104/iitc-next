/**
 * Register official plugins and expose the pluginManager for other scripts to register themselves.
 */

import { unsafeWindow } from "vite-plugin-monkey/dist/client";
import { pluginManager } from "../managers/pluginManager";

export default async function registerPlugins() {
  unsafeWindow.iitc.pluginManager = pluginManager;

  // Import official plugins
  await import("../plugins/playerActivity");
}
