/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { TEAMS, PORTAL_LEVELS } from "../types/ingress";
import { safeLocalStorage } from "../utils/storage";
import { logManager } from "./logManager";

const CESIUM_PASS_OVERLAY = 13;
const FILTER_STATES_STORAGE_KEY = "iitc-next-filter-states";
const PLUGIN_FILTER_STATES_STORAGE_KEY = "iitc-next-plugin-filter-states";
const MUTUALLY_EXCLUSIVE_HISTORY_FILTERS = [
  "history",
  "history-reverse",
  "scout-control",
  "scout-control-reverse",
];

type DataSourceDisplayWithCollections = Cesium.DataSourceDisplay & {
  _primitives: Cesium.PrimitiveCollection;
  _groundPrimitives: Cesium.PrimitiveCollection;
};

interface LayerRenderCommand {
  pass?: unknown;
  renderState: unknown;
}

interface LayerFrameState {
  commandList: LayerRenderCommand[];
  passes?: {
    render?: boolean;
    pick?: boolean;
  };
}

type PrimitiveCollectionWithUpdate = {
  update: (frameState: LayerFrameState) => void;
};

type CesiumWithPrivateRenderer = typeof Cesium & {
  RenderState?: {
    fromCache: (renderState: Record<string, unknown>) => unknown;
  };
};

class OverlayLayer {
  public viewer: Cesium.Viewer;
  public source: Cesium.DataSource;
  public zIndex: number;
  private readonly dataSourceCollection = new Cesium.DataSourceCollection();
  private readonly display: Cesium.DataSourceDisplay;
  private readonly ready: Promise<Cesium.DataSource>;
  private readonly removeClockListener: () => void;
  private readonly removeCollectionListener: () => void;
  private isDestroyed: boolean = false;

  constructor(
    viewer: Cesium.Viewer,
    name: string,
    visible: boolean,
    zIndex: number,
  ) {
    this.viewer = viewer;
    this.source = new Cesium.CustomDataSource(name);
    this.source.show = visible;
    this.zIndex = zIndex;

    this.ready = this.dataSourceCollection.add(this.source);
    this.display = new Cesium.DataSourceDisplay({
      scene: this.viewer.scene,
      dataSourceCollection: this.dataSourceCollection,
    });

    this.installOverlayHooks();

    this.ready.then(() => {
      if (this.isDestroyed) {
        this.dataSourceCollection.remove(this.source, true);
        return;
      }
      this.raiseToTop();
    });

    this.removeClockListener = this.viewer.clock.onTick.addEventListener((clock) => {
      if (this.isDestroyed || this.viewer.isDestroyed()) return;
      this.display.update(clock.currentTime);
    });

    this.removeCollectionListener = this.source.entities.collectionChanged.addEventListener(() => {
      if (this.isDestroyed || this.viewer.isDestroyed()) return;
      this.viewer.scene.requestRender();
    });
  }

  public setVisible(visible: boolean): void {
    this.source.show = visible;
  }

  public setZIndex(zIndex: number): void {
    if (this.zIndex === zIndex) return;
    this.zIndex = zIndex;
    this.viewer.scene.requestRender();
  }

  private installOverlayHooks(): void {
    const collections = this.display as DataSourceDisplayWithCollections;
    this.installOverlayHook(collections._primitives as unknown as PrimitiveCollectionWithUpdate);
    this.installOverlayHook(collections._groundPrimitives as unknown as PrimitiveCollectionWithUpdate);
  }

  private installOverlayHook(collection: PrimitiveCollectionWithUpdate): void {
    const originalUpdate = collection.update.bind(collection);

    collection.update = (frameState: LayerFrameState) => {
      const firstCommand = frameState.commandList.length;
      originalUpdate(frameState);

      if (!frameState.passes?.render || frameState.passes.pick) return;

      for (let i = firstCommand; i < frameState.commandList.length; i++) {
        const command = frameState.commandList[i];
        command.pass = CESIUM_PASS_OVERLAY;
        command.renderState = getNoDepthRenderState(command.renderState);
      }
    };
  }

  public raiseToTop(): void {
    if (this.isDestroyed || this.viewer.isDestroyed()) return;

    const collections = this.display as DataSourceDisplayWithCollections;
    if (this.viewer.scene.primitives.contains(collections._primitives)) {
      this.viewer.scene.primitives.raiseToTop(collections._primitives);
    }
    if (this.viewer.scene.groundPrimitives.contains(collections._groundPrimitives)) {
      this.viewer.scene.groundPrimitives.raiseToTop(collections._groundPrimitives);
    }
    this.viewer.scene.requestRender();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.removeClockListener();
    this.removeCollectionListener();
    this.display.destroy();
    this.dataSourceCollection.remove(this.source, true);
  }
}

export class LayerManager {
  private static readonly DEFAULT_OVERLAY_Z_INDEX = 1000;

  // Built-in layers like portals and links use normal dataSources
  private dataSources: Map<string, Cesium.DataSource> = new Map();

  // Overlay layers use custom OverlayLayer and are mostly used by plugins
  private overlayLayers: Map<string, OverlayLayer> = new Map();

  // Master layer visibility settings that are shown in the layer detail pane
  private layerVisibility: Map<string, boolean> = new Map();

  // Fine-grained filter controls that separate each portal-level-faction pair, etc.
  private filterState: Map<string, boolean> = new Map();
  private pluginFilterState: Map<string, boolean> = new Map();
  private pendingRenderFrame: number | null = null;

  constructor(private readonly viewer: Cesium.Viewer) {
    this.loadDefaults();
    this.loadStorageState();
  }

  private loadDefaults() {
    TEAMS.forEach(t => this.filterState.set(`team-${t.toLowerCase()}`, true));
    PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, true));
    this.filterState.set("portals-placeholder", true);
    this.filterState.set("portals-label", true);
    this.filterState.set("portals-ornament", true);
    this.filterState.set("portals", true);
    this.filterState.set("links", true);
    this.filterState.set("fields", true);
    this.filterState.set("history", false);
    this.filterState.set("scout-control", false);
    this.filterState.set("history-reverse", false);
    this.filterState.set("scout-control-reverse", false);
    this.filterState.set("debug-tiles", false);
    this.applyFilters();
  }

  private loadStorageState() {
    const stored = safeLocalStorage.getItem(FILTER_STATES_STORAGE_KEY);
    const pluginStored = safeLocalStorage.getItem(PLUGIN_FILTER_STATES_STORAGE_KEY);

    if (stored) {
      try {
        const states = JSON.parse(stored);
        if (Array.isArray(states)) {
          states.forEach(([name, enabled]) => {
            if (typeof name === "string" && typeof enabled === "boolean") {
              this.filterState.set(name, enabled);
            }
          });
          logManager.debug("LayerManager", `Loaded ${states.length} filters from storage.`);
        }
      } catch (e) {
        logManager.error("LayerManager", "Failed to load filters from storage", e);
        this.removeStorageState();
      }
    }

    if (pluginStored) {
      try {
        const states = JSON.parse(pluginStored);
        if (Array.isArray(states)) {
          states.forEach(([name, enabled]) => {
            if (typeof name === "string" && typeof enabled === "boolean") {
              this.pluginFilterState.set(name, enabled);
            }
          });
          logManager.debug("PluginManager", `Loaded ${states.length} plugin filters from storage.`);
        }
      } catch (e) {
        logManager.error("LayerManager", "Failed to load plugin filter states from storage", e);
        this.removeStorageState();
      }
    }

    this.normalizeMutuallyExclusiveFilters();
    this.applyFilters();
  }

  private saveStorageState() {
    const states = Array.from(this.filterState);
    const pluginStates = Array.from(this.pluginFilterState);
    safeLocalStorage.setItem(FILTER_STATES_STORAGE_KEY, JSON.stringify(states));
    safeLocalStorage.setItem(PLUGIN_FILTER_STATES_STORAGE_KEY, JSON.stringify(pluginStates));
  }

  private removeStorageState() {
    safeLocalStorage.removeItem(FILTER_STATES_STORAGE_KEY);
    safeLocalStorage.removeItem(PLUGIN_FILTER_STATES_STORAGE_KEY);
  }

  public setFilter(type: string, enabled: boolean): void {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, enabled));
        this.filterState.set("portals-placeholder", enabled);
        this.filterState.set("portals-label", enabled);
        this.filterState.set("portals-ornament", enabled);
      }
      if (enabled && MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.includes(type)) {
        MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.forEach(filter => this.filterState.set(filter, false));
      }
      this.filterState.set(type, enabled);
    } else {
      this.pluginFilterState.set(type, enabled);
    }
    this.applyFilters();
    this.saveStorageState();
  }

  public isFilterEnabled(type: string): boolean {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`level-${l}`) !== false);
        const placeholder = this.filterState.get("portals-placeholder") !== false;
        const label = this.filterState.get("portals-label") !== false;
        const ornament = this.filterState.get("portals-ornament") !== false;
        return allLevels && placeholder && label && ornament;
      }
      return this.filterState.get(type) !== false;
    } else {
      return this.pluginFilterState.get(type) !== false;
    }
  }

  public isFilterIndeterminate(type: string): boolean {
    if (this.isBuiltInFilter(type)) {
      if (type === "portals") {
        const states = PORTAL_LEVELS.map(l => this.filterState.get(`level-${l}`) !== false);
        states.push(this.filterState.get("portals-placeholder") !== false);
        states.push(this.filterState.get("portals-label") !== false);
        states.push(this.filterState.get("portals-ornament") !== false);
        const visibleCount = states.filter(v => v).length;
        return visibleCount > 0 && visibleCount < states.length;
      }
      return false;
    } else {
      return false;
    }
  }

  public getPluginFilters(): Array<[string, boolean]> {
    return Array.from(this.pluginFilterState).filter(([name]) => this.overlayLayers.has(name));
  }

  public getOrCreateDataSourceLayer(name: string): Cesium.DataSource {
    let source = this.dataSources.get(name);
    if (!source) {
      source = new Cesium.CustomDataSource(name);
      source.show = this.getLayerVisibility(name);

      // Unknown effect - Disabled for performance to avoid lag when zooming in and out
      // source.entities.collectionChanged.addEventListener(() => this.viewer.scene.requestRender());

      // Ensure overlay layers are always on top
      this.viewer.dataSources.add(source).then(() => this.raiseOverlayLayersToTop());
      this.dataSources.set(name, source);
    }

    return source;
  }

  public getOrCreateOverlayLayer(name: string, zIndex?: number): Cesium.DataSource {
    let layer = this.overlayLayers.get(name);

    if (!layer) {
      layer = new OverlayLayer(this.viewer, name, this.getLayerVisibility(name), zIndex ?? LayerManager.DEFAULT_OVERLAY_Z_INDEX);
      this.overlayLayers.set(name, layer);
      this.raiseOverlayLayersToTop();
    } else if (zIndex !== undefined) {
      layer.setZIndex(zIndex);
      this.raiseOverlayLayersToTop();
    }

    if (!this.pluginFilterState.has(name)) {
      this.pluginFilterState.set(name, true);
      this.saveStorageState();
    }

    return layer.source;
  }

  public setOverlayLayerZIndex(name: string, zIndex: number): void {
    const layer = this.overlayLayers.get(name);
    if (!layer) return;

    layer.setZIndex(zIndex);
    this.raiseOverlayLayersToTop();
  }

  public removeOverlayLayer(name: string): void {
    const layer = this.overlayLayers.get(name);
    if (layer) {
      layer.destroy();
      this.overlayLayers.delete(name);
    }

    if (this.pluginFilterState.has(name)) {
      this.pluginFilterState.delete(name);
      this.layerVisibility.delete(name);
      this.saveStorageState();
    }
  }

  private setLayerVisibility(name: string, visible: boolean): void {
    const previousVisible = this.layerVisibility.get(name);
    this.layerVisibility.set(name, visible);

    const dataSource = this.dataSources.get(name);
    if (dataSource) dataSource.show = visible;

    const pluginLayer = this.overlayLayers.get(name);
    if (pluginLayer) pluginLayer.setVisible(visible);

    if (previousVisible !== visible) this.requestVisibilityRender();
  }

  private getLayerVisibility(name: string): boolean {
    return this.layerVisibility.get(name) !== false;
  }

  private raiseOverlayLayersToTop(): void {
    Array.from(this.overlayLayers.values())
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach(layer => layer.raiseToTop());
  }

  private requestVisibilityRender(): void {
    if (this.viewer.isDestroyed()) return;
    if (this.pendingRenderFrame !== null) return;

    // Coalesce filter changes so one checkbox toggle only updates Cesium's data source display once.
    this.pendingRenderFrame = requestAnimationFrame(() => {
      this.pendingRenderFrame = null;
      if (this.viewer.isDestroyed()) return;

      // Force visualizers to consume data source show changes before request-render mode draws.
      this.viewer.dataSourceDisplay.update(this.viewer.clock.currentTime);
      this.viewer.scene.requestRender();
    });
  }

  private isBuiltInFilter(filterName: string): boolean {
    return this.filterState.has(filterName);
  }

  private normalizeMutuallyExclusiveFilters(): void {
    let enabledFilter: string | null = null;

    MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.forEach(filter => {
      if (this.filterState.get(filter) !== true) return;

      // Enable the first previously enabled filter only
      if (enabledFilter) {
        this.filterState.set(filter, false);
      } else {
        enabledFilter = filter;
      }
    });
  }

  private applyFilters(): void {
    const teams = TEAMS.map(t => t.toLowerCase());

    teams.forEach(t => {
      const teamVisible = this.filterState.get(`team-${t}`) !== false;

      // Portals
      PORTAL_LEVELS.forEach(l => {
        const levelVisible = this.filterState.get(`level-${l}`) !== false;
        this.setLayerVisibility(`portals-l${l}-${t}`, teamVisible && levelVisible);
      });

      // Portal labels
      const portalLabelsVisible = this.filterState.get("portals-label") !== false;
      this.setLayerVisibility(`portals-label-${t}`, teamVisible && portalLabelsVisible);

      // Portal Ornaments
      const portalOrnamentsVisible = this.filterState.get("portals-ornament") !== false;
      this.setLayerVisibility(`portals-ornament-${t}`, teamVisible && portalOrnamentsVisible);

      // Placeholders
      const placeholdersVisible = this.filterState.get("portals-placeholder") !== false;
      this.setLayerVisibility(`portals-placeholder-${t}`, teamVisible && placeholdersVisible);

      // Links
      const linksVisible = this.filterState.get("links") !== false;
      this.setLayerVisibility(`links-${t}`, teamVisible && linksVisible);

      // Fields
      const fieldsVisible = this.filterState.get("fields") !== false;
      this.setLayerVisibility(`fields-${t}`, teamVisible && fieldsVisible);
    });

    // History
    const historyVisible = this.filterState.get("history") !== false;
    this.setLayerVisibility("history-visited-captured", historyVisible);

    // History Reverse
    const historyReverseVisible = this.filterState.get("history-reverse") !== false;
    this.setLayerVisibility("history-visited-captured-reverse", historyReverseVisible);

    // Scout Control History
    const scoutControlVisible = this.filterState.get("scout-control") !== false;
    this.setLayerVisibility("history-scout-control", scoutControlVisible);

    // Scout Control Reverse
    const scoutControlReverseVisible = this.filterState.get("scout-control-reverse") !== false;
    this.setLayerVisibility("history-scout-control-reverse", scoutControlReverseVisible);

    // Debug tiles
    const debugTilesVisible = this.filterState.get("debug-tiles") !== false;
    this.setLayerVisibility("debug-tiles", debugTilesVisible);

    // Plugins
    const pluginFilters = this.pluginFilterState.keys();
    for (const filter of pluginFilters) {
      const pluginFilterVisible = this.pluginFilterState.get(filter) !== false;
      this.setLayerVisibility(filter, pluginFilterVisible);
    }

    this.viewer.scene.requestRender();
  }
}

const noDepthRenderStateCache = new WeakMap<object, unknown>();

function getNoDepthRenderState(renderState: unknown): unknown {
  const renderStateFactory = (Cesium as CesiumWithPrivateRenderer).RenderState;
  if (!renderStateFactory || !isObject(renderState)) return renderState;

  const cached = noDepthRenderStateCache.get(renderState);
  if (cached) return cached;

  const noDepthRenderState = renderStateFactory.fromCache({
    ...renderState,
    depthTest: {
      ...(isObject(renderState.depthTest) ? renderState.depthTest : {}),
      enabled: false,
    },
  });

  noDepthRenderStateCache.set(renderState, noDepthRenderState);
  return noDepthRenderState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
