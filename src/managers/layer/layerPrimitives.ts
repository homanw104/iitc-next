/**
 * Manages primitive-backed render layers.
 */

import * as Cesium from "cesium";

export class LayerPrimitives {
  public readonly collection: Cesium.PrimitiveCollection;
  public readonly pointPrimitives: Cesium.PointPrimitiveCollection;

  private isDestroyed = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    visible: boolean,
  ) {
    this.collection = new Cesium.PrimitiveCollection({ show: visible });
    this.pointPrimitives = this.collection.add(new Cesium.PointPrimitiveCollection());
    this.viewer.scene.primitives.add(this.collection);
  }

  public setVisible(visible: boolean): void {
    this.collection.show = visible;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.viewer.scene.primitives.remove(this.collection);
  }
}
