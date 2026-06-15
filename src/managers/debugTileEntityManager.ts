/**
 * Manages the visualization of tiles for debugging purposes.
 * Creates a debug entity (rectangle) for each tile being loaded in the map.
 */

import * as Cesium from "cesium";
import { TileStatus, getMapZoomTileParameters, tileToLat, tileToLng } from "./tileRequestManager";
import { LayerManager } from "./layerManager";

/**
 * Manages the visualization of tiles for debugging purposes.
 * It shows rectangles on the map representing the tiles being loaded.
 */
export class DebugTileEntityManager {
  private viewer: Cesium.Viewer;
  private layerManager: LayerManager;
  private tileEntities: Map<string, Cesium.Entity> = new Map();
  private readonly layerId = "debug-tiles";

  constructor(viewer: Cesium.Viewer, entityManager: LayerManager) {
    this.viewer = viewer;
    this.layerManager = entityManager;
  }

  /**
   * Updates or creates a debug entity for the given tile key and status.
   *
   * @param key - The unique identifier for the tile.
   * @param status - The current status of the tile.
   */
  public updateTile(key: string, status: TileStatus): void {
    const existing = this.tileEntities.get(key);
    if (existing) {
      this.updateTileEntity(existing, status);
    } else {
      const entity = this.createTileEntity(key, status);
      if (entity) {
        this.tileEntities.set(key, entity);
        const source = this.layerManager.getOrCreateDataSourceLayer(this.layerId);
        source.entities.add(entity);
        this.updateTileEntity(entity, status); // Handle immediate removal if status is already loaded/error
      }
    }
    this.viewer.scene.requestRender();
  }

  /**
   * Creates a Cesium entity (rectangle) for a tile.
   *
   * @param key - The tile key to parse for coordinates.
   * @param status - The initial status of the tile.
   * @returns A Cesium entity representing the tile, or undefined if parsing fails.
   */
  private createTileEntity(key: string, status: TileStatus): Cesium.Entity | undefined {
    const parts = key.split("_");
    if (parts.length < 3) return undefined;

    const zoom = parseInt(parts[0]);
    const x = parseInt(parts[1]);
    const y = parseInt(parts[2]);

    const params = getMapZoomTileParameters(zoom);
    const west = tileToLng(x, params);
    const east = tileToLng(x + 1, params);
    const north = tileToLat(y, params);
    const south = tileToLat(y + 1, params);

    // Add padding (approx 10% of tile size)
    const lngPadding = (east - west) * 0.05;
    const latPadding = (north - south) * 0.05;

    let finalWest = west + lngPadding;
    let finalEast = east - lngPadding;
    const finalSouth = south + latPadding;
    const finalNorth = north - latPadding;

    // Normalize longitude to [-180, 180]
    const normalizeLng = (lng: number) => {
      while (lng > 180) lng -= 360;
      while (lng < -180) lng += 360;
      return lng;
    };

    finalWest = normalizeLng(finalWest);
    finalEast = normalizeLng(finalEast);

    const color = this.getStatusColor(status);

    return new Cesium.Entity({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          finalWest,
          finalSouth,
          finalEast,
          finalNorth
        ),
        fill: true,
        material: color.withAlpha(0.1),
        outline: true,
        outlineColor: color,
        outlineWidth: 2,
        height: 10,   // Slightly above ground to prevent z-fighting
      },
      properties: {
        selectable: false,
      }
    });
  }

  /**
   * Updates an existing Cesium entity with a new status color.
   *
   * @param entity - The entity to update.
   * @param status - The new status of the tile.
   */
  private updateTileEntity(entity: Cesium.Entity, status: TileStatus): void {
    const color = this.getStatusColor(status);
    if (entity.rectangle) {
      entity.rectangle.outlineColor = new Cesium.ConstantProperty(color);
      entity.rectangle.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.1));
    }

    if (status === "loaded" || status === "error") {
      setTimeout(() => {
        const source = this.layerManager.getOrCreateDataSourceLayer(this.layerId);
        source.entities.remove(entity);
        // Find and remove from map
        for (const [key, ent] of this.tileEntities.entries()) {
          if (ent === entity) {
            this.tileEntities.delete(key);
            break;
          }
        }
        this.viewer.scene.requestRender();
      }, 2000);
    }
  }

  /**
   * Maps a tile status to a Cesium color.
   *
   * @param status - The tile status.
   * @returns The corresponding Cesium color.
   */
  private getStatusColor(status: TileStatus): Cesium.Color {
    switch (status) {
      case "queued":
        return Cesium.Color.LIGHTGRAY;
      case "requested":
        return Cesium.Color.DARKSALMON;
      case "loaded":
        return Cesium.Color.GREENYELLOW;
      case "error":
        return Cesium.Color.RED;
      default:
        return Cesium.Color.WHITE;
    }
  }
}
