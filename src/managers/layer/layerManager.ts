/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { TEAMS, PORTAL_LEVELS } from "../../types/ingress";
import { safeLocalStorage } from "../../utils/storage";
import { logManager } from "../system/logManager";

const CESIUM_PASS_OVERLAY = 13;
const LOG_TAG = "LayerManager";
const FILTER_STATES_STORAGE_KEY = "iitc-next-filter-states";
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
  uniformMap?: unknown;
  renderState: unknown;
}

interface LayerFrameState {
  commandList: LayerRenderCommand[];
  context?: {
    defaultTexture?: unknown;
  };
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

class Overlay {
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
      // Only rewrite commands emitted by this overlay display, not commands already
      // queued by the main viewer or other overlays earlier in the frame.
      const firstCommand = frameState.commandList.length;
      originalUpdate(frameState);

      // Picking needs Cesium's normal command passes/render states so object
      // selection keeps working. The overlay rewrite is only for color renders.
      if (!frameState.passes?.render || frameState.passes.pick) return;

      for (let i = firstCommand; i < frameState.commandList.length; i++) {
        const command = frameState.commandList[i];

        // Draw this data source in Cesium's final overlay pass so it does not
        // visually blend with normal data source entities.
        command.pass = CESIUM_PASS_OVERLAY;

        // Overlay entities should render on top of terrain/tiles regardless of
        // their original visualizer depth state.
        command.renderState = getNoDepthRenderState(command.renderState);

        // Billboard and label atlases can be one render turn behind during
        // startup. Bind Cesium's default texture for that transient gap instead
        // of letting UniformSampler read `_target` from undefined.
        command.uniformMap = getSafeOverlayUniformMap(command.uniformMap, frameState.context);
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

  // Entities like links and portals use normal DataSources, the name is the same as the dataSourceAndOverlayVisibility
  private dataSources: Map<string, Cesium.DataSource> = new Map();

  // Entities like player activity markers use custom Overlay, the name is the same as the dataSourceAndOverlayVisibility
  private overlays: Map<string, Overlay> = new Map();

  // Fine-grained filter controls that separate each DataSources or OverlayLayers like "portal-l8-enlightened", etc.
  private dataSourceAndOverlayVisibility: Map<string, boolean> = new Map();

  // Master layer visibility settings like "portals" that are shown in the layer detail pane
  private filterState: Map<string, boolean> = new Map();

  // Book-keeper for requestRender
  private pendingRenderFrame: number | null = null;

  // Register plugin-related data sources and overlays
  private pluginDataSourceAndOverlayNames: Set<string> = new Set();

  constructor(
    private readonly viewer: Cesium.Viewer
  ) {
    this.loadDefaults();
    this.loadStorageState();
  }

  private loadDefaults(): void {
    this.filterState = createDefaultFilterState();
    this.applyFilters();
  }

  private loadStorageState(): void {
    const stored = safeLocalStorage.getItem(FILTER_STATES_STORAGE_KEY);

    try {
      if (stored) {
        const states = JSON.parse(stored);
        if (Array.isArray(states)) {
          states.forEach(([name, enabled]) => {
            if (typeof name === "string" && typeof enabled === "boolean") {
              this.filterState.set(name, enabled);
            }
          });
          logManager.debug(LOG_TAG, `Loaded ${states.length} filters from storage.`);
        }
      }
    } catch (e) {
      logManager.warn(LOG_TAG, "Failed to load filters from storage", e);
      this.removeStorageState();
    } finally {
      this.normalizeMutuallyExclusiveFilters();
      this.applyFilters();
    }
  }

  private saveStorageState(): void {
    safeLocalStorage.setItem(FILTER_STATES_STORAGE_KEY, JSON.stringify(Array.from(this.filterState)));
  }

  private removeStorageState(): void {
    safeLocalStorage.removeItem(FILTER_STATES_STORAGE_KEY);
  }

  public setFilter(name: string, enabled: boolean): void {
    if (name === "portals") {
      PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, enabled));
      this.filterState.set("portals-placeholder", enabled);
      this.filterState.set("portals-label", enabled);
      this.filterState.set("portals-ornament", enabled);
    }
    if (enabled && MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.includes(name)) {
      MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.forEach(filter => this.filterState.set(filter, false));
    }
    this.filterState.set(name, enabled);
    this.applyFilters();
    this.saveStorageState();
  }

  public isFilterEnabled(name: string): boolean {
    if (name === "portals") {
      const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`level-${l}`) !== false);
      const placeholder = this.filterState.get("portals-placeholder") !== false;
      const label = this.filterState.get("portals-label") !== false;
      const ornament = this.filterState.get("portals-ornament") !== false;
      return allLevels && placeholder && label && ornament;
    }
    return this.filterState.get(name) !== false;
  }

  public isFilterIndeterminate(name: string): boolean {
    if (name === "portals") {
      const states = PORTAL_LEVELS.map(l => this.filterState.get(`level-${l}`) !== false);
      states.push(this.filterState.get("portals-placeholder") !== false);
      states.push(this.filterState.get("portals-label") !== false);
      states.push(this.filterState.get("portals-ornament") !== false);
      const visibleCount = states.filter(v => v).length;
      return visibleCount > 0 && visibleCount < states.length;
    }
    return false;
  }

  public getOrCreateDataSource(name: string): Cesium.DataSource {
    if (!isBuiltInDataSourceOrOverlay(name)) this.registerPluginFilter(name);
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
    if (!isBuiltInDataSourceOrOverlay(name)) this.registerPluginFilter(name);
    let layer = this.overlays.get(name);
    if (!layer) {
      layer = new Overlay(
        this.viewer,
        name,
        this.getLayerVisibility(name),
        zIndex ?? LayerManager.DEFAULT_OVERLAY_Z_INDEX
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
    if (layer) {
      layer.setZIndex(zIndex);
      this.refreshOverlays();
    }
  }

  public removeDataSource(name: string): void {
    const source = this.dataSources.get(name);
    if (source) {
      this.viewer.dataSources.remove(source, true);
      this.dataSources.delete(name);
    }
    if (!isBuiltInDataSourceOrOverlay(name)) this.unregisterPluginFilter(name);
  }

  public removeOverlay(name: string): void {
    const layer = this.overlays.get(name);
    if (layer) {
      layer.destroy();
      this.overlays.delete(name);
    }
    if (!isBuiltInDataSourceOrOverlay(name)) this.unregisterPluginFilter(name);
  }

  private registerPluginFilter(name: string): void {
    this.pluginDataSourceAndOverlayNames.add(name);
    if (!this.filterState.has(name)) {
      this.filterState.set(name, true);
      this.saveStorageState();
    }
    const pluginFilterVisible = this.filterState.get(name) !== false;
    this.setLayerVisibility(name, pluginFilterVisible);
  }

  private unregisterPluginFilter(name: string): void {
    this.pluginDataSourceAndOverlayNames.delete(name);
    if (this.filterState.has(name)) {
      this.filterState.delete(name);
      this.dataSourceAndOverlayVisibility.delete(name);
      this.saveStorageState();
    }
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
    this.pendingRenderFrame = requestAnimationFrame(() => {
      this.pendingRenderFrame = null;
      if (this.viewer.isDestroyed()) return;

      // Force visualizers to consume data source show changes before request-render mode draws.
      this.viewer.dataSourceDisplay.update(this.viewer.clock.currentTime);
      this.viewer.scene.requestRender();
    });
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
    return Array.from(this.pluginDataSourceAndOverlayNames, name => [name, this.filterState.get(name) !== false]);
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
    const pluginFilters = this.pluginDataSourceAndOverlayNames;
    for (const filter of pluginFilters) {
      const pluginFilterVisible = this.filterState.get(filter) !== false;
      this.setLayerVisibility(filter, pluginFilterVisible);
    }

    this.viewer.scene.requestRender();
  }
}

const noDepthRenderStateCache = new WeakMap<object, unknown>();
const safeOverlayUniformMapCache = new WeakMap<object, unknown>();

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

function getSafeOverlayUniformMap(uniformMap: unknown, context: LayerFrameState["context"]): unknown {
  if (!isObject(uniformMap) || !context?.defaultTexture) return uniformMap;

  const cached = safeOverlayUniformMapCache.get(uniformMap);
  if (cached) return cached;

  const safeUniformMap = {
    ...uniformMap,
    u_atlas: wrapTextureUniform(uniformMap.u_atlas, context.defaultTexture),
    billboard_texture: wrapTextureUniform(uniformMap.billboard_texture, context.defaultTexture),
  };

  safeOverlayUniformMapCache.set(uniformMap, safeUniformMap);
  return safeUniformMap;
}

function wrapTextureUniform(uniform: unknown, fallbackTexture: unknown): unknown {
  if (typeof uniform !== "function") return uniform;
  return () => uniform() ?? fallbackTexture;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDefaultFilterState(): Map<string, boolean> {
  const filterState = new Map<string, boolean>();

  TEAMS.forEach(t => filterState.set(`team-${t.toLowerCase()}`, true));
  PORTAL_LEVELS.forEach(l => filterState.set(`level-${l}`, true));
  filterState.set("portals-placeholder", true);
  filterState.set("portals-label", true);
  filterState.set("portals-ornament", true);
  filterState.set("portals", true);
  filterState.set("links", true);
  filterState.set("fields", true);
  filterState.set("history", false);
  filterState.set("scout-control", false);
  filterState.set("history-reverse", false);
  filterState.set("scout-control-reverse", false);
  filterState.set("debug-tiles", false);

  return filterState;
}

function isBuiltInFilter(name: string): boolean {
  return createDefaultFilterState().has(name);
}

function isBuiltInDataSourceOrOverlay(name: string): boolean {
  const builtInDataSourceAndOverlayNames = [
    "history-visited-captured",
    "history-visited-captured-reverse",
    "history-scout-control",
    "history-scout-control-reverse",
    "debug-tiles",
  ];

  TEAMS.forEach(t => {
    const team = t.toLowerCase();

    PORTAL_LEVELS.forEach(l => builtInDataSourceAndOverlayNames.push(`portals-l${l}-${team}`));
    builtInDataSourceAndOverlayNames.push(`portals-placeholder-${team}`);
    builtInDataSourceAndOverlayNames.push(`portals-label-${team}`);
    builtInDataSourceAndOverlayNames.push(`portals-ornament-${team}`);
    builtInDataSourceAndOverlayNames.push(`links-${team}`);
    builtInDataSourceAndOverlayNames.push(`fields-${team}`);
  });

  return builtInDataSourceAndOverlayNames.includes(name);
}
