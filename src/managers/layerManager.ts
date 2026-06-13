/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { TEAMS, PORTAL_LEVELS } from "../types/ingress";
import { safeLocalStorage } from "../utils/storage";
import { logManager } from "./logManager";

const FILTER_STATES_STORAGE_KEY = "iitc-next-filter-states";
const PLUGIN_FILTER_STATES_STORAGE_KEY = "iitc-next-plugin-filter-states";

export class LayerManager {
  private viewer: Cesium.Viewer;

  // Maps sourceVisibility keys to Cesium Sources (layers)
  private sources: Map<string, Cesium.CustomDataSource> = new Map();

  // Granular controls (portals-l8-enlightened, portals-placeholder-resistance, etc.)
  private sourceVisibility: Map<string, boolean> = new Map();

  // Upper level controls (portals, links, fields)
  private filterState: Map<string, boolean> = new Map();

  // Plugin-specific controls (e.g. "Player activity Res", which will be shown in layer chooser)
  public pluginFilterStates: Map<string, boolean> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.loadDefaults();
    this.loadState().then();
  }

  private loadDefaults() {
    TEAMS.forEach(t => this.filterState.set(`team-${t.toLowerCase()}`, true));
    PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, true));
    this.filterState.set("portals-placeholder", true);
    this.filterState.set("portals", true);
    this.filterState.set("links", true);
    this.filterState.set("fields", true);
    this.filterState.set("label-portals", true);
    this.filterState.set("history", false);
    this.filterState.set("scout-control", false);
    this.filterState.set("history-reverse", false);
    this.filterState.set("scout-control-reverse", false);
    this.filterState.set("debug-tiles", false);
    this.applyFilters();
  }

  private async loadState() {
    const stored = safeLocalStorage.getItem(FILTER_STATES_STORAGE_KEY);
    const pluginStored = safeLocalStorage.getItem(PLUGIN_FILTER_STATES_STORAGE_KEY);

    if (stored) {
      try {
        const states = JSON.parse(stored);
        if (Array.isArray(states)) {
          this.filterState = new Map(states);
          logManager.debug("LayerManager", `Loaded ${states.length} filters from storage.`);
        }
      } catch (e) {
        logManager.error("LayerManager", "Failed to load filters from storage", e);
        this.removeState();
      }
    }

    if (pluginStored) {
      try {
        const states = JSON.parse(pluginStored);
        if (Array.isArray(states)) {
          this.pluginFilterStates = new Map(states);
          logManager.debug("PluginManager", `Loaded ${states.length} plugin filters from storage.`);
        }
      } catch (e) {
        logManager.error("LayerManager", "Failed to load plugin filter states from storage", e);
        this.removeState();
      }
    }

    this.applyFilters();
  }

  private saveState() {
    const states = Array.from(this.filterState);
    const pluginStates = Array.from(this.pluginFilterStates);
    safeLocalStorage.setItem(FILTER_STATES_STORAGE_KEY, JSON.stringify(states));
    safeLocalStorage.setItem(PLUGIN_FILTER_STATES_STORAGE_KEY, JSON.stringify(pluginStates));
  }

  private removeState() {
    safeLocalStorage.removeItem(FILTER_STATES_STORAGE_KEY);
    safeLocalStorage.removeItem(PLUGIN_FILTER_STATES_STORAGE_KEY);
  }

  public setFilter(type: string, enabled: boolean): void {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, enabled));
        this.filterState.set("portals-placeholder", enabled);
      }
      this.filterState.set(type, enabled);
    } else {
      this.pluginFilterStates.set(type, enabled);
    }
    this.applyFilters();
    this.saveState();
  }

  public isFilterEnabled(type: string): boolean {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`level-${l}`) !== false);
        const placeholder = this.filterState.get("portals-placeholder") !== false;
        return allLevels && placeholder;
      }
      return this.filterState.get(type) !== false;
    } else {
      return this.pluginFilterStates.get(type) !== false;
    }
  }

  public isFilterIndeterminate(type: string): boolean {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        const states = PORTAL_LEVELS.map(l => this.filterState.get(`level-${l}`) !== false);
        states.push(this.filterState.get("portals-placeholder") !== false);
        const visibleCount = states.filter(v => v).length;
        return visibleCount > 0 && visibleCount < states.length;
      }
      return false;
    } else {
      return false;
    }
  }

  public getOrCreateSourceAndFilter(name: string): Cesium.CustomDataSource {
    let source = this.sources.get(name);
    if (!source) {
      source = new Cesium.CustomDataSource(name);
      // Apply saved visibility or default to true
      source.show = this.sourceVisibility.has(name)
        ? this.sourceVisibility.get(name)!
        : true;

      this.sources.set(name, source);
      this.viewer.dataSources.add(source).then();
    }

    // Create the filter as well if it's a plugin layer
    if (!this.isBuiltInSource(name) && !this.pluginFilterStates.has(name)) {
      this.pluginFilterStates.set(name, true);
      this.saveState();
    }

    return source;
  }

  public removeSourceAndFilter(name: string): void {
    const source = this.sources.get(name);
    if (source) {
      this.viewer.dataSources.remove(source);
      this.sources.delete(name);
      this.viewer.scene.requestRender();
    }

    // Delete the filter as well if it's a plugin layer
    if (!this.isBuiltInSource(name) && this.pluginFilterStates.has(name)) {
      this.pluginFilterStates.delete(name);
      this.sourceVisibility.delete(name);
      this.saveState();
    }
  }

  public setSourceVisible(name: string, visible: boolean): void {
    this.sourceVisibility.set(name, visible);
    const source = this.sources.get(name);
    if (source) {
      source.show = visible;
      this.viewer.scene.requestRender();
    }
  }

  private isBuiltInSource(name: string): boolean {
    // Built-in sources have different names for filter and source
    return this.sourceVisibility.has(name) && !this.pluginFilterStates.has(name);
  }

  private isBuiltInFilter(filterName: string): boolean {
    // filterState is exclusive to built-in filters
    return this.filterState.has(filterName);
  }

  private applyFilters(): void {
    const teams = TEAMS.map(t => t.toLowerCase());

    teams.forEach(t => {
      const teamVisible = this.filterState.get(`team-${t}`) !== false;

      // Portals
      PORTAL_LEVELS.forEach(l => {
        const levelVisible = this.filterState.get(`level-${l}`) !== false;
        this.setSourceVisible(`portals-l${l}-${t}`, teamVisible && levelVisible);
      });

      // Portal labels
      const portalLabelsVisible = this.filterState.get("label-portals") !== false;
      this.setSourceVisible(`label-portal-${t}`, teamVisible && portalLabelsVisible);

      // Placeholders
      const placeholdersVisible = this.filterState.get("portals-placeholder") !== false;
      this.setSourceVisible(`portals-placeholder-${t}`, teamVisible && placeholdersVisible);

      // Links
      const linksVisible = this.filterState.get("links") !== false;
      this.setSourceVisible(`links-${t}`, teamVisible && linksVisible);

      // Fields
      const fieldsVisible = this.filterState.get("fields") !== false;
      this.setSourceVisible(`fields-${t}`, teamVisible && fieldsVisible);
    });

    // History
    const historyVisible = this.filterState.get("history") !== false;
    this.setSourceVisible("history-visited-captured", historyVisible);

    // History Reverse
    const historyReverseVisible = this.filterState.get("history-reverse") !== false;
    this.setSourceVisible("history-visited-captured-reverse", historyReverseVisible);

    // Scout Control History
    const scoutControlVisible = this.filterState.get("scout-control") !== false;
    this.setSourceVisible("history-scout-control", scoutControlVisible);

    // Scout Control Reverse
    const scoutControlReverseVisible = this.filterState.get("scout-control-reverse") !== false;
    this.setSourceVisible("history-scout-control-reverse", scoutControlReverseVisible);

    // Debug tiles
    const debugTilesVisible = this.filterState.get("debug-tiles") !== false;
    this.setSourceVisible("debug-tiles", debugTilesVisible);

    // Plugins (filter name should be the same as the layer name)
    const pluginFilters = this.pluginFilterStates.keys();
    for (const filter of pluginFilters) {
      const pluginFilterVisible = this.pluginFilterStates.get(filter) !== false;
      this.setSourceVisible(filter, pluginFilterVisible);
    }

    this.viewer.scene.requestRender();
  }
}
