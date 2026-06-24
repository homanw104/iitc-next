/**
 * Manages the lifecycle and state of IITC plugins.
 */

import type { IITCPlugin } from "../../types/iitc";
import { safeLocalStorage } from "../../utils/storage";
import { logManager } from "./logManager";

const LOG_TAG = "PluginManager";
const ENABLED_PLUGINS_STORAGE_KEY = "iitc-enabled-plugins";

export class PluginManager {
  private plugins: Map<string, IITCPlugin> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private activePlugins = new Set<string>();
  private pluginRuntimeReady = false;

  private initialized = false;

  public async initialize() {
    if (this.initialized) return;
    await this.loadState();
    this.initialized = true;
  }

  private async loadState() {
    const stored = safeLocalStorage.getItem(ENABLED_PLUGINS_STORAGE_KEY);

    if (stored) {
      try {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) {
          this.enabledPlugins = new Set(ids);
          logManager.debug(LOG_TAG, `Loaded ${ids.length} enabled plugins from storage.`);
        }
      } catch (e) {
        logManager.error(LOG_TAG, "Failed to load plugin state", e);
        this.removeState();
      }
    }
  }

  private saveState() {
    const ids = Array.from(this.enabledPlugins);
    safeLocalStorage.setItem(ENABLED_PLUGINS_STORAGE_KEY, JSON.stringify(ids));
  }

  private removeState() {
    safeLocalStorage.removeItem(ENABLED_PLUGINS_STORAGE_KEY);
  }

  public isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  public isInitialized(pluginId: string): boolean {
    return this.activePlugins.has(pluginId);
  }

  public registerPlugin(plugin: IITCPlugin) {
    logManager.debug(LOG_TAG, `Registering plugin ${plugin.name} (${plugin.id})`);
    if (this.plugins.has(plugin.id)) {
      logManager.warn(LOG_TAG, `Plugin ${plugin.name} (${plugin.id}) is already registered`);
    } else {
      this.plugins.set(plugin.id, plugin);
      logManager.info(LOG_TAG, `Plugin registered: ${plugin.name}`);

      if (this.pluginRuntimeReady && this.isEnabled(plugin.id)) this.initPlugin(plugin.id);
    }

  }

  public enablePlugin(pluginId: string) {
    if (!this.enabledPlugins.has(pluginId)) {
      this.enabledPlugins.add(pluginId);
      this.saveState();
    }

    if (this.pluginRuntimeReady) this.initPlugin(pluginId);
  }

  public disablePlugin(pluginId: string) {
    if (this.enabledPlugins.has(pluginId)) {
      this.enabledPlugins.delete(pluginId);
      this.saveState();
    }

    this.deinitPlugin(pluginId);
  }

  public initEnabledPlugins() {
    this.pluginRuntimeReady = true;

    this.plugins.forEach(plugin => {
      if (this.isEnabled(plugin.id)) {
        this.initPlugin(plugin.id);
      } else {
        logManager.info(LOG_TAG, `Plugin ${plugin.name} is disabled`);
      }
    });
  }

  private initPlugin(pluginId: string) {
    if (this.isInitialized(pluginId)) return;

    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    try {
      plugin.init();
      this.activePlugins.add(pluginId);
      logManager.info(LOG_TAG, `Plugin ${plugin.name} enabled`);
    } catch (e) {
      logManager.error(LOG_TAG, `Failed to initialize plugin ${plugin.name}`, e);
    }
  }

  private deinitPlugin(pluginId: string) {
    if (!this.isInitialized(pluginId)) return;

    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.deinit) {
      try {
        plugin.deinit();
        this.activePlugins.delete(pluginId);
        logManager.info(LOG_TAG, `Disabled plugin ${plugin.name}`);
      } catch {
        logManager.error(LOG_TAG, `Failed to deinit plugin ${plugin.name}: Reload needed`);
      }
    } else {
      this.activePlugins.delete(pluginId);
      logManager.info(LOG_TAG, `Disabled plugin ${plugin.name}: Reload needed`);
    }
  }

  getPlugins(): IITCPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginManager = new PluginManager();
