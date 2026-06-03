/**
 * Define procedures for loading plugins.
 */

import { logManager } from "../managers/logManager";
import { pluginManager } from "../managers/pluginManager";

export default function initPlugins(): void {
  const plugins = pluginManager.getPlugins();
  
  plugins.forEach(plugin => {
    if (pluginManager.isEnabled(plugin.id) && !pluginManager.isInitialized(plugin.id)) {
      try {
        pluginManager.enablePlugin(plugin.id);
      } catch (e) {
        logManager.error("RegisterPlugins", `Failed to initialize plugin ${plugin.name}`, e);
      }
    } else if (pluginManager.isInitialized(plugin.id)) {
      logManager.info("RegisterPlugins", `Plugin ${plugin.name} is already initialized`);
    } else {
      logManager.info("RegisterPlugins", `Plugin ${plugin.name} is disabled`);
    }
  });
}
