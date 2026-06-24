/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { safeLocalStorage } from "../../utils/storage";
import { logManager } from "../system/logManager";
import {
  FILTER_STATES_STORAGE_KEY,
  MUTUALLY_EXCLUSIVE_HISTORY_FILTERS,
  PORTAL_GROUP_FILTER,
  applyLayerFilters,
  createDefaultFilterState,
  getPortalChildFilterStates,
  isBuiltInDataSourceOrOverlay,
  isBuiltInFilter,
  normalizeMutuallyExclusiveFilters,
  setPortalChildFilters,
} from "./layerFilters";
import { LayerOverlay } from "./layerOverlay";

const LOG_TAG = "LayerManager";

export class LayerManager {
  private static readonly DEFAULT_OVERLAY_Z_INDEX = 1000;

  // Entities like links and portals use normal DataSources, named by layer visibility id.
  private dataSources: Map<string, Cesium.DataSource> = new Map();

  // Entities like player activity markers use custom overlays, named by layer visibility id.
  private overlays: Map<string, LayerOverlay> = new Map();

  // Fine-grained layer visibility state, such as "portals-l8-enlightened".
  private dataSourceAndOverlayVisibility: Map<string, boolean> = new Map();

  // Master filter visibility settings, such as "portals", shown in the layer chooser.
  private filterState: Map<string, boolean> = new Map();

  private pendingRenderFrame: number | null = null;
  private pluginDataSourceAndOverlayNames: Set<string> = new Set();

  constructor(private readonly viewer: Cesium.Viewer) {
    this.loadDefaults();
    this.loadStorageState();
  }

  public setFilter(name: string, enabled: boolean): void {
    if (name === PORTAL_GROUP_FILTER) {
      setPortalChildFilters(this.filterState, enabled);
    }
    if (enabled && MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.includes(name)) {
      MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.forEach(filter => this.filterState.set(filter, false));
    }

    this.filterState.set(name, enabled);
    this.applyFilters();
    this.saveStorageState();
  }

  public isFilterEnabled(name: string): boolean {
    if (name === PORTAL_GROUP_FILTER) {
      return getPortalChildFilterStates(this.filterState).every(Boolean);
    }
    return this.filterState.get(name) !== false;
  }

  public isFilterIndeterminate(name: string): boolean {
    if (name !== PORTAL_GROUP_FILTER) return false;

    const states = getPortalChildFilterStates(this.filterState);
    const visibleCount = states.filter(Boolean).length;
    return visibleCount > 0 && visibleCount < states.length;
  }

  public getOrCreateDataSource(name: string): Cesium.DataSource {
    this.registerPluginFilterIfNeeded(name);

    let source = this.dataSources.get(name);
    if (!source) {
      source = new Cesium.CustomDataSource(name);
      source.show = this.getLayerVisibility(name);
      this.viewer.dataSources.add(source).then(() => this.refreshOverlays());
      this.dataSources.set(name, source);
    }
    return source;
  }

  public getOrCreateOverlay(name: string, zIndex?: number): Cesium.DataSource {
    this.registerPluginFilterIfNeeded(name);

    let layer = this.overlays.get(name);
    if (!layer) {
      layer = new LayerOverlay(
        this.viewer,
        name,
        this.getLayerVisibility(name),
        zIndex ?? LayerManager.DEFAULT_OVERLAY_Z_INDEX,
      );
      this.overlays.set(name, layer);
      this.refreshOverlays();
    } else if (zIndex !== undefined) {
      layer.setZIndex(zIndex);
      this.refreshOverlays();
    }
    return layer.source;
  }

  public setOverlayZIndex(name: string, zIndex: number): void {
    const layer = this.overlays.get(name);
    if (!layer) return;

    layer.setZIndex(zIndex);
    this.refreshOverlays();
  }

  public removeDataSource(name: string): void {
    const source = this.dataSources.get(name);
    if (source) {
      this.viewer.dataSources.remove(source, true);
      this.dataSources.delete(name);
    }
    this.unregisterPluginFilterIfNeeded(name);
  }

  public removeOverlay(name: string): void {
    const layer = this.overlays.get(name);
    if (layer) {
      layer.destroy();
      this.overlays.delete(name);
    }
    this.unregisterPluginFilterIfNeeded(name);
  }

  public finalizePluginFilterRegistration(): void {
    Array.from(this.filterState.keys()).forEach(name => {
      if (!isBuiltInFilter(name) && !this.pluginDataSourceAndOverlayNames.has(name)) {
        this.filterState.delete(name);
      }
    });

    this.saveStorageState();
    this.applyFilters();
  }

  public getPluginFilters(): Array<[string, boolean]> {
    return Array.from(
      this.pluginDataSourceAndOverlayNames,
      name => [name, this.filterState.get(name) !== false],
    );
  }

  private loadDefaults(): void {
    this.filterState = createDefaultFilterState();
    this.applyFilters();
  }

  private loadStorageState(): void {
    const stored = safeLocalStorage.getItem(FILTER_STATES_STORAGE_KEY);

    try {
      if (stored) this.mergeStoredFilterState(stored);
    } catch (e) {
      logManager.warn(LOG_TAG, "Failed to load filters from storage", e);
      this.removeStorageState();
    } finally {
      normalizeMutuallyExclusiveFilters(this.filterState);
      this.applyFilters();
    }
  }

  private mergeStoredFilterState(stored: string): void {
    const states = JSON.parse(stored);
    if (!Array.isArray(states)) return;

    states.forEach(([name, enabled]) => {
      if (typeof name === "string" && typeof enabled === "boolean") {
        this.filterState.set(name, enabled);
      }
    });
    logManager.debug(LOG_TAG, `Loaded ${states.length} filters from storage.`);
  }

  private saveStorageState(): void {
    safeLocalStorage.setItem(FILTER_STATES_STORAGE_KEY, JSON.stringify(Array.from(this.filterState)));
  }

  private removeStorageState(): void {
    safeLocalStorage.removeItem(FILTER_STATES_STORAGE_KEY);
  }

  private registerPluginFilterIfNeeded(name: string): void {
    if (!isBuiltInDataSourceOrOverlay(name)) {
      this.registerPluginFilter(name);
    }
  }

  private unregisterPluginFilterIfNeeded(name: string): void {
    if (!isBuiltInDataSourceOrOverlay(name)) {
      this.unregisterPluginFilter(name);
    }
  }

  private registerPluginFilter(name: string): void {
    this.pluginDataSourceAndOverlayNames.add(name);
    if (!this.filterState.has(name)) {
      this.filterState.set(name, true);
      this.saveStorageState();
    }

    this.setLayerVisibility(name, this.filterState.get(name) !== false);
  }

  private unregisterPluginFilter(name: string): void {
    this.pluginDataSourceAndOverlayNames.delete(name);
    if (!this.filterState.has(name)) return;

    this.filterState.delete(name);
    this.dataSourceAndOverlayVisibility.delete(name);
    this.saveStorageState();
  }

  private applyFilters(): void {
    applyLayerFilters(
      this.filterState,
      this.pluginDataSourceAndOverlayNames,
      (name, visible) => this.setLayerVisibility(name, visible),
    );
    this.viewer.scene.requestRender();
  }

  private setLayerVisibility(name: string, visible: boolean): void {
    const previousVisible = this.dataSourceAndOverlayVisibility.get(name);
    this.dataSourceAndOverlayVisibility.set(name, visible);

    const dataSource = this.dataSources.get(name);
    if (dataSource) dataSource.show = visible;

    const overlay = this.overlays.get(name);
    if (overlay) overlay.setVisible(visible);

    if (previousVisible !== visible) this.refreshScene();
  }

  private getLayerVisibility(name: string): boolean {
    return this.dataSourceAndOverlayVisibility.get(name) !== false;
  }

  private refreshOverlays(): void {
    Array.from(this.overlays.values())
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach(layer => layer.raiseToTop());
  }

  private refreshScene(): void {
    if (this.viewer.isDestroyed()) return;
    if (this.pendingRenderFrame !== null) return;

    // Coalesce filter changes so one checkbox toggle only updates Cesium's data source display once.
    this.pendingRenderFrame = window.requestAnimationFrame(() => {
      this.pendingRenderFrame = null;
      if (this.viewer.isDestroyed()) return;

      // Force visualizers to consume data source show changes before request-render mode draws.
      this.viewer.dataSourceDisplay.update(this.viewer.clock.currentTime);
      this.viewer.scene.requestRender();
    });
  }
}
