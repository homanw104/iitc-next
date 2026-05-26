/**
 * Utilities for managing Cesium entities and data sources.
 */

import * as Cesium from "cesium";

/**
 * Manages Cesium DataSources (layers).
 */
export class LayerManager {
  private viewer: Cesium.Viewer;
  private sources: Map<string, Cesium.CustomDataSource> = new Map();
  private visibilitySettings: Map<string, boolean> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  /**
   * Gets or creates a data source with the given name.
   * @param name The name of the data source.
   * @returns The data source.
   */
  public getOrCreateSource(name: string): Cesium.CustomDataSource {
    let source = this.sources.get(name);
    if (!source) {
      source = new Cesium.CustomDataSource(name);
      // Apply saved visibility or default to true
      source.show = this.visibilitySettings.has(name) 
        ? this.visibilitySettings.get(name)! 
        : true;
      
      this.sources.set(name, source);
      this.viewer.dataSources.add(source).then();
    }
    return source;
  }

  /**
   * Sets the visibility of a layer.
   * @param name The name of the layer.
   * @param visible Whether the layer should be visible.
   */
  public setLayerVisible(name: string, visible: boolean): void {
    this.visibilitySettings.set(name, visible);
    const source = this.sources.get(name);
    if (source) {
      source.show = visible;
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Checks if a layer is visible.
   * @param name The name of the layer.
   * @returns True if the layer is visible, false otherwise.
   */
  public isLayerVisible(name: string): boolean {
    if (this.visibilitySettings.has(name)) {
      return this.visibilitySettings.get(name)!;
    }
    const source = this.sources.get(name);
    return source ? source.show : true; // Default to true if not set
  }
}
