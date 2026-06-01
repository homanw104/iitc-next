import { IITCPlugin } from "../types/iitc";
import { logManager } from "../managers/logManager";

export default function registerPlugins() {
  window.iitc.plugins = window.iitc.plugins || [];
  window.iitc.registerPlugin = (plugin: IITCPlugin) => {
    if (window.iitc.plugins?.some(p => p.id === plugin.id)) {
      logManager.warn("RegisterPlugins", `Plugin ${plugin.name} (${plugin.id}) is already registered.`);
      return;
    }
    window.iitc.plugins = window.iitc.plugins || [];
    window.iitc.plugins.push(plugin);
    logManager.info("RegisterPlugins", `Plugin registered: ${plugin.name}`);

    // If IITC is already fully initialized, init the plugin immediately
    if (window.iitc.viewer) {
      try {
        plugin.init();
      } catch (e) {
        logManager.error("RegisterPlugins", `Failed to initialize plugin ${plugin.name}`, e);
      }
    }
  };

  // Process any plugins that registered before IITC was ready
  window.iitc.plugins.forEach((p: any) => window.iitc.registerPlugin?.(p));
}
