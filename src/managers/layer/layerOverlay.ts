/**
 * Manages overlay render layers that are shown atop of other layers,
 * backed by an isolated data source display.
 */

import * as Cesium from "cesium";

const CESIUM_PASS_OVERLAY = 13;

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

export class LayerOverlay {
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
