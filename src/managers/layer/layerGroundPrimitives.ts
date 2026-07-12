/**
 * Manages ground primitive layers and atomically swaps asynchronously built geometry.
 */

import * as Cesium from "cesium";

interface ReplaceablePrimitive {
  readonly ready: boolean;
  show: boolean;
}

interface PrimitiveReplacement {
  active?: ReplaceablePrimitive;
  pending?: ReplaceablePrimitive;
}

export class LayerGroundPrimitives {
  public readonly collection: Cesium.PrimitiveCollection;
  public zIndex: number;

  private readonly primitiveReplacer: AsyncPrimitiveReplacer;
  private isDestroyed = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    visible: boolean,
    zIndex: number,
  ) {
    this.zIndex = zIndex;

    this.collection = new Cesium.PrimitiveCollection({ show: visible });
    this.primitiveReplacer = new AsyncPrimitiveReplacer(this.viewer.scene, this.collection);
    this.viewer.scene.groundPrimitives.add(this.collection);
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

  public replacePrimitiveWhenReady(key: string, primitive: ReplaceablePrimitive): void {
    this.primitiveReplacer.replace(key, primitive);
  }

  public replaceGroundPrimitivesWhenReady(key: string, primitives: Cesium.GroundPrimitive[]): void {
    this.primitiveReplacer.replace(key, new GroundPrimitiveGroup(primitives));
  }

  public removeManagedPrimitive(key: string): boolean {
    return this.primitiveReplacer.remove(key);
  }

  public raiseToTop(): void {
    if (this.isDestroyed || this.viewer.isDestroyed()) return;

    if (this.viewer.scene.groundPrimitives.contains(this.collection)) {
      this.viewer.scene.groundPrimitives.raiseToTop(this.collection);
    }
    this.viewer.scene.requestRender();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.primitiveReplacer.destroy();
    this.viewer.scene.groundPrimitives.remove(this.collection);
  }
}

interface UpdatablePrimitive {
  update(frameState: unknown): void;
}

class GroundPrimitiveGroup implements ReplaceablePrimitive {
  public show = true;
  private isDestroyedValue = false;

  constructor(private readonly primitives: Cesium.GroundPrimitive[]) {}

  public get ready(): boolean {
    return this.primitives.every(primitive => primitive.ready);
  }

  public update(frameState: unknown): void {
    this.primitives.forEach((primitive) => {
      primitive.show = this.show;
      (primitive as unknown as UpdatablePrimitive).update(frameState);
    });
  }

  public isDestroyed(): boolean {
    return this.isDestroyedValue;
  }

  public destroy(): void {
    if (this.isDestroyedValue) return;
    this.isDestroyedValue = true;
    this.primitives.forEach(primitive => primitive.destroy());
  }
}

class AsyncPrimitiveReplacer {
  private replacements: Map<string, PrimitiveReplacement> = new Map();
  private removePostRenderListener?: () => void;
  private isDestroyed = false;

  constructor(
    private readonly scene: Cesium.Scene,
    private readonly collection: Cesium.PrimitiveCollection,
  ) {}

  public replace(key: string, primitive: ReplaceablePrimitive): void {
    if (this.isDestroyed) return;

    const replacement = this.replacements.get(key) ?? {};
    if (replacement.pending) this.collection.remove(replacement.pending);

    primitive.show = false;
    replacement.pending = this.collection.add(primitive) as ReplaceablePrimitive;
    this.replacements.set(key, replacement);
    this.startWatchingForReadyPrimitives();
    this.scene.requestRender();
  }

  public remove(key: string): boolean {
    const replacement = this.replacements.get(key);
    if (!replacement) return false;

    let removed = false;
    if (replacement.active) removed = this.collection.remove(replacement.active) || removed;
    if (replacement.pending) removed = this.collection.remove(replacement.pending) || removed;
    this.replacements.delete(key);
    this.stopWatchingIfIdle();
    if (removed) this.scene.requestRender();
    return removed;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stopWatchingForReadyPrimitives();

    this.replacements.forEach((replacement) => {
      if (replacement.active) this.collection.remove(replacement.active);
      if (replacement.pending) this.collection.remove(replacement.pending);
    });
    this.replacements.clear();
  }

  private startWatchingForReadyPrimitives(): void {
    if (this.removePostRenderListener) return;
    this.removePostRenderListener = this.scene.postRender.addEventListener(this.swapReadyPrimitives);
  }

  private stopWatchingIfIdle(): void {
    if (this.hasPendingPrimitives()) return;
    this.stopWatchingForReadyPrimitives();
  }

  private stopWatchingForReadyPrimitives(): void {
    this.removePostRenderListener?.();
    this.removePostRenderListener = undefined;
  }

  private hasPendingPrimitives(): boolean {
    for (const replacement of this.replacements.values()) {
      if (replacement.pending) return true;
    }
    return false;
  }

  private swapReadyPrimitives = (): void => {
    let swapped = false;
    this.replacements.forEach((replacement) => {
      const pending = replacement.pending;
      if (!pending?.ready) return;

      if (replacement.active) this.collection.remove(replacement.active);
      pending.show = true;
      replacement.active = pending;
      replacement.pending = undefined;
      swapped = true;
    });

    this.stopWatchingIfIdle();
    if (swapped) this.scene.requestRender();
  };
}
