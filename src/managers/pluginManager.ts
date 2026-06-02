/**
 * Manages the lifecycle and state of IITC plugins.
 */

import { IITCPlugin } from "../types/iitc";
import { logManager } from "./logManager";

export class PluginManager {
  private plugins: Map<string, IITCPlugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private initializedPlugins = new Set<string>();
  private ENABLED_PLUGINS_STORAGE_KEY = "iitc-enabled-plugins";

  constructor() {
    this.loadState();
  }

  private loadState() {
    const stored = localStorage.getItem(this.ENABLED_PLUGINS_STORAGE_KEY);
    if (stored) {
      try {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) this.enabledPlugins = new Set(ids);
        logManager.debug("PluginManager", "Loaded plugins state");
      } catch (e) {
        logManager.error("PluginManager", "Failed to load plugin state", e);
        this.removeState();
      }
    }
  }

  private saveState() {
    logManager.debug("PluginManager", "Saving plugin states");
    localStorage.setItem(this.ENABLED_PLUGINS_STORAGE_KEY, JSON.stringify(Array.from(this.enabledPlugins)));
  }

  private removeState() {
    logManager.debug("PluginManager", "Clearing plugin states");
    localStorage.removeItem(this.ENABLED_PLUGINS_STORAGE_KEY);
  }

  public isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  public isInitialized(pluginId: string): boolean {
    return this.initializedPlugins.has(pluginId);
  }

  public registerPlugin(plugin: IITCPlugin) {
    logManager.debug("PluginManager", `Registering plugin ${plugin.name} (${plugin.id})`);
    if (this.plugins.has(plugin.id)) {
      logManager.warn("PluginManager", `Plugin ${plugin.name} (${plugin.id}) is already registered`);
    } else {
      this.plugins.set(plugin.id, plugin);
      logManager.info("PluginManager", `Plugin registered: ${plugin.name}`);
    }

    if (this.isEnabled(plugin.id) && !this.isInitialized(plugin.id)) {
      this.enablePlugin(plugin.id);
    }
  }

  enablePlugin(pluginId: string) {
    if (!this.enabledPlugins.has(pluginId)) {
      this.enabledPlugins.add(pluginId);
      this.saveState();
    }
    const plugin = this.plugins.get(pluginId);
    if (plugin && !this.isInitialized(pluginId)) {
      try {
        plugin.init();
        this.initializedPlugins.add(pluginId);
        logManager.info("PluginManager", `Enabled plugin ${plugin.name}`);
      } catch (e) {
        logManager.error("PluginManager", `Failed to initialize plugin ${plugin.name}`, e);
      }
    }
  }

  disablePlugin(pluginId: string) {
    if (this.enabledPlugins.has(pluginId)) {
      this.enabledPlugins.delete(pluginId);
      this.saveState();
    }
    const plugin = this.plugins.get(pluginId);
    if (plugin && plugin.deinit) {
      try {
        plugin.deinit();
        this.initializedPlugins.delete(pluginId);
        logManager.info("PluginManager", `Disabled plugin ${plugin.name}`);
      } catch (e) {
        logManager.error("PluginManager", `Failed to deinit plugin ${plugin.name}: Reload needed`);
      }
    } else if (plugin) {
      this.initializedPlugins.delete(pluginId);
      logManager.info("PluginManager", `Disabled plugin ${plugin.name}: Reload needed`);
    }
  }

  getPlugins(): IITCPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginManager = new PluginManager();
