/**
 * Manages primitive-backed render layers.
 */

import * as Cesium from "cesium";

export class LayerPrimitives {
  public readonly collection: Cesium.PrimitiveCollection;
  public readonly billboards: Cesium.BillboardCollection;
  public readonly pointPrimitives: Cesium.PointPrimitiveCollection;
  public zIndex: number;

  private isDestroyed = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    visible: boolean,
    zIndex: number,
  ) {
    this.zIndex = zIndex;

    this.collection = new Cesium.PrimitiveCollection({ show: visible });
    this.billboards = this.collection.add(new Cesium.BillboardCollection({ scene: this.viewer.scene }));
    this.pointPrimitives = this.collection.add(new Cesium.PointPrimitiveCollection());
    this.viewer.scene.primitives.add(this.collection);
  }

  public setVisible(visible: boolean): void {
    this.collection.show = visible;
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

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.viewer.scene.primitives.remove(this.collection);
  }
}
