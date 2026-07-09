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
import { LayerPrimitives } from "./layerPrimitives";

const LOG_TAG = "LayerManager";

export class LayerManager {
  private static readonly DEFAULT_PRIMITIVE_Z_INDEX = 0;
  private static readonly DEFAULT_OVERLAY_Z_INDEX = 1000;

  // Links, fields, etc., use normal DataSource layers, named by layer visibility id.
  private dataSources: Map<string, Cesium.DataSource> = new Map();

  // Player activity markers, labels, etc., use primitive-backed overlay layers, named by layer visibility id.
  private overlayLayers: Map<string, LayerOverlay> = new Map();

  // Primitive-backed layers for performance-sensitive visuals, named by layer visibility id.
  private primitiveLayers: Map<string, LayerPrimitives> = new Map();

  // Fine-grained layer visibility state, such as "portals-l8-enlightened".
  private layerVisibility: Map<string, boolean> = new Map();

  // Master filter visibility settings, such as "portals", that govern fine-grained layers.
  // THIS IS THE SOURCE OF THE OPTIONS SHOWN IN THE LAYER PANE.
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
      this.viewer.dataSources.add(source).then(() => this.refreshRenderLayerOrder());
      this.dataSources.set(name, source);
    }
    return source;
  }

  public getOrCreateOverlayLayer(name: string, zIndex?: number): LayerOverlay {
    this.registerPluginFilterIfNeeded(name);

    let layer = this.overlayLayers.get(name);
    if (!layer) {
      layer = new LayerOverlay(
        this.viewer,
        this.getLayerVisibility(name),
        zIndex ?? LayerManager.DEFAULT_OVERLAY_Z_INDEX,
      );
      this.overlayLayers.set(name, layer);
      this.refreshRenderLayerOrder();
    } else if (zIndex !== undefined) {
      layer.setZIndex(zIndex);
      this.refreshRenderLayerOrder();
    }
    return layer;
  }

  public getOrCreatePrimitiveLayer(name: string, zIndex?: number): LayerPrimitives {
    this.registerPluginFilterIfNeeded(name);

    let layer = this.primitiveLayers.get(name);
    if (!layer) {
      layer = new LayerPrimitives(
        this.viewer,
        this.getLayerVisibility(name),
        zIndex ?? LayerManager.DEFAULT_PRIMITIVE_Z_INDEX,
      );
      this.primitiveLayers.set(name, layer);
      this.refreshRenderLayerOrder();
    } else if (zIndex !== undefined && layer.zIndex !== zIndex) {
      layer.setZIndex(zIndex);
      this.refreshRenderLayerOrder();
    }
    return layer;
  }

  public async withEntityCollectionEventsSuspended<T>(
    layers: { name: string; type: "dataSource" }[],
    callback: () => Promise<T>
  ): Promise<T> {
    const suspendedCollections = this.getEntityCollections(layers);

    // Coalesce Cesium collection change notifications while an async batch adds,
    // removes, or moves entities across the affected layers.
    suspendedCollections.forEach((entities) => entities.suspendEvents());
    try {
      return await callback();
    } finally {
      Array.from(suspendedCollections).reverse().forEach((entities) => entities.resumeEvents());
    }
  }

  public withEntityCollectionEventsSuspendedSync<T>(
    layers: { name: string; type: "dataSource" }[],
    callback: () => T
  ): T {
    const suspendedCollections = this.getEntityCollections(layers);

    // Synchronous variant for non-awaiting mutation loops. Use this when all
    // entity mutations happen before the callback returns, for example,
    //
    // withEntityCollectionEventsSuspendedSync(layers, () => ids.forEach(removeEntity));
    //
    // If the callback awaits terrain, network, or any other async work, use
    // withEntityCollectionEventsSuspended so events stay suspended until done.
    suspendedCollections.forEach((entities) => entities.suspendEvents());
    try {
      return callback();
    } finally {
      Array.from(suspendedCollections).reverse().forEach((entities) => entities.resumeEvents());
    }
  }

  private getEntityCollections(layers: { name: string; type: "dataSource" }[]): Set<Cesium.EntityCollection> {
    const collections = new Set<Cesium.EntityCollection>();

    layers.forEach(({ name }) => {
      const source = this.getOrCreateDataSource(name);
      collections.add(source.entities);
    });

    return collections;
  }

  public setOverlayZIndex(name: string, zIndex: number): void {
    const layer = this.overlayLayers.get(name);
    if (!layer) return;

    layer.setZIndex(zIndex);
    this.refreshRenderLayerOrder();
  }

  public removeDataSourceLayer(name: string): void {
    const source = this.dataSources.get(name);
    if (source) {
      this.viewer.dataSources.remove(source, true);
      this.dataSources.delete(name);
    }
    this.unregisterPluginFilterIfNeeded(name);
  }

  public removeOverlayLayer(name: string): void {
    const layer = this.overlayLayers.get(name);
    if (layer) {
      layer.destroy();
      this.overlayLayers.delete(name);
    }
    this.unregisterPluginFilterIfNeeded(name);
  }

  public removePrimitiveLayer(name: string): void {
    const layer = this.primitiveLayers.get(name);
    if (layer) {
      layer.destroy();
      this.primitiveLayers.delete(name);
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
    this.layerVisibility.delete(name);
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
    const previousVisible = this.layerVisibility.get(name);
    this.layerVisibility.set(name, visible);

    const dataSource = this.dataSources.get(name);
    if (dataSource) dataSource.show = visible;

    const overlay = this.overlayLayers.get(name);
    if (overlay) overlay.setVisible(visible);

    const primitiveLayer = this.primitiveLayers.get(name);
    if (primitiveLayer) primitiveLayer.setVisible(visible);

    if (previousVisible !== visible) this.refreshScene();
  }

  private getLayerVisibility(name: string): boolean {
    return this.layerVisibility.get(name) !== false;
  }

  private refreshRenderLayerOrder(): void {
    Array.from(this.primitiveLayers.values())
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach(layer => layer.raiseToTop());

    Array.from(this.overlayLayers.values())
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
