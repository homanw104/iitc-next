/**
 * Define procedures for loading plugins.
 */
import { logManager } from "../managers/logManager";

export default function loadPlugins(): void {
  // Initialize all plugins registered so far
  window.iitc.plugins?.forEach(plugin => {
    try {
      plugin.init();
      logManager.info("RegisterPlugins", `Initialized plugin ${plugin.name}`);
    } catch (e) {
      logManager.error("RegisterPlugins", `Failed to initialize plugin ${plugin.name}`, e);
    }
  });

  // Load plugins in development mode
  if (import.meta.env.DEV) {
    logManager.info("RegisterPlugins", "Development mode: loading all plugins from src/plugins...");
    const plugins = import.meta.glob("../plugins/*.ts");
    for (const path in plugins) {
      plugins[path]().then(() => {
        logManager.info("RegisterPlugins", `Plugin loaded: ${path}`);
      }).catch(e => {
        logManager.error("RegisterPlugins", `Failed to load plugin from ${path}`, e);
      });
    }
  }
}
