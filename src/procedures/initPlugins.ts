/**
 * Define procedures for loading plugins.
 */

import { logManager } from "../managers/logManager";
import { pluginManager } from "../managers/pluginManager";
import type { LayerManager } from "../managers/layerManager";

export default function initPlugins(layerManager: LayerManager): void {
  const plugins = pluginManager.getPlugins();
  
  plugins.forEach(plugin => {
    if (pluginManager.isEnabled(plugin.id) && !pluginManager.isInitialized(plugin.id)) {
      try {
        pluginManager.enablePlugin(plugin.id);
      } catch (e) {
        logManager.error("InitPlugins", `Failed to initialize plugin ${plugin.name}`, e);
      }
    } else if (pluginManager.isInitialized(plugin.id)) {
      logManager.info("InitPlugins", `Plugin ${plugin.name} is already initialized`);
    } else {
      logManager.info("InitPlugins", `Plugin ${plugin.name} is disabled`);
    }
  });

  layerManager.finalizePluginFilterRegistration();
}
