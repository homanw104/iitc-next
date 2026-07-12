/**
 * Manages overlay render layers that are shown atop of other layers,
 * backed by direct primitive collections.
 */

import * as Cesium from "cesium";

const CESIUM_PASS_OVERLAY = 13;

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

export class OverlayLayer {
  public readonly collection: Cesium.PrimitiveCollection;
  public readonly labels: Cesium.LabelCollection;
  public readonly billboards: Cesium.BillboardCollection;
  public readonly points: Cesium.PointPrimitiveCollection;
  public zIndex: number;
  private isDestroyed: boolean = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    visible: boolean,
    zIndex: number,
  ) {
    this.zIndex = zIndex;

    this.collection = new Cesium.PrimitiveCollection({ show: visible });
    this.labels = this.collection.add(new Cesium.LabelCollection({ scene: this.viewer.scene }));
    this.billboards = this.collection.add(new Cesium.BillboardCollection({ scene: this.viewer.scene }));
    this.points = this.collection.add(new Cesium.PointPrimitiveCollection());

    this.installOverlayHooks();
    this.viewer.scene.primitives.add(this.collection);
  }

  public setVisible(visible: boolean): void {
    this.collection.show = visible;
    this.viewer.scene.requestRender();
  }

  public setZIndex(zIndex: number): void {
    if (this.zIndex === zIndex) return;
    this.zIndex = zIndex;
    this.viewer.scene.requestRender();
  }

  public raiseToTop(): void {
    if (this.isDestroyed || this.viewer.isDestroyed()) return;

    if (this.viewer.scene.primitives.contains(this.collection)) {
      this.viewer.scene.primitives.raiseToTop(this.collection);
    }
    this.viewer.scene.requestRender();
  }

  public addLabel(options: Cesium.Label.ConstructorOptions): Cesium.Label {
    const label = this.labels.add(options);
    this.viewer.scene.requestRender();
    return label;
  }

  public removeLabel(label: Cesium.Label): boolean {
    const removed = this.labels.remove(label);
    if (removed) this.viewer.scene.requestRender();
    return removed;
  }

  public addBillboard(options: Cesium.Billboard.ConstructorOptions): Cesium.Billboard {
    const billboard = this.billboards.add(options);
    this.viewer.scene.requestRender();
    return billboard;
  }

  public removeBillboard(billboard: Cesium.Billboard): boolean {
    const removed = this.billboards.remove(billboard);
    if (removed) this.viewer.scene.requestRender();
    return removed;
  }

  public addPoint(options?: Parameters<Cesium.PointPrimitiveCollection["add"]>[0]): Cesium.PointPrimitive {
    const point = this.points.add(options);
    this.viewer.scene.requestRender();
    return point;
  }

  public removePoint(point: Cesium.PointPrimitive): boolean {
    const removed = this.points.remove(point);
    if (removed) this.viewer.scene.requestRender();
    return removed;
  }

  public addPrimitive<T>(primitive: T): T {
    const added = this.collection.add(primitive) as T;
    this.viewer.scene.requestRender();
    return added;
  }

  public removePrimitive(primitive: unknown): boolean {
    const removed = this.collection.remove(primitive);
    if (removed) this.viewer.scene.requestRender();
    return removed;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.viewer.scene.primitives.remove(this.collection);
  }

  private installOverlayHooks(): void {
    this.installOverlayHook(this.collection as unknown as PrimitiveCollectionWithUpdate);
  }

  private installOverlayHook(collection: PrimitiveCollectionWithUpdate): void {
    const originalUpdate = collection.update.bind(collection);

    collection.update = (frameState: LayerFrameState) => {
      // Only rewrite commands emitted by this overlay collection, not commands already
      // queued by the main viewer or other overlays earlier in the frame.
      const firstCommand = frameState.commandList.length;
      originalUpdate(frameState);

      // Picking needs Cesium's normal command passes/render states so object
      // selection keeps working. The overlay rewrite is only for color renders.
      if (!frameState.passes?.render || frameState.passes.pick) return;

      for (let i = firstCommand; i < frameState.commandList.length; i++) {
        const command = frameState.commandList[i];

        // Draw this layer in Cesium's final overlay pass so it does not
        // visually blend with normal entities or primitives.
        command.pass = CESIUM_PASS_OVERLAY;

        // Overlay primitives should render on top of terrain/tiles regardless
        // of their collection's original depth state.
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
