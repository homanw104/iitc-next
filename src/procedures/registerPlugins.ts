import { pluginManager } from "../managers/pluginManager";

export default async function registerPlugins() {
  window.iitc.pluginManager = pluginManager;

  // Import official plugins
  await import("../plugins/playerActivity");
}
