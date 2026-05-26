/**
 * Manages the visualization of tiles for debugging purposes.
 * Creates a debug entity (rectangle) for each tile being loaded in the map.
 */

import * as Cesium from "cesium";
import { TileManager, TileStatus, getMapZoomTileParameters, tileToLat, tileToLng } from "./tileManager";
import { EntityManager } from "./entityManager";

/**
 * Manages the visualization of tiles for debugging purposes.
 * It shows rectangles on the map representing the tiles being loaded.
 */
export class DebugTileManager {
  private tileManager: TileManager;
  private entityManager: EntityManager;
  private tileEntities: Map<string, Cesium.Entity> = new Map();
  private layerId = "debug-tiles";

  constructor(tileManager: TileManager, entityManager: EntityManager) {
    this.tileManager = tileManager;
    this.entityManager = entityManager;

    this.tileManager.onTileStatusChange((key, status) => {
      this.updateTile(key, status);
    });
  }

  /**
   * Updates or creates a debug entity for the given tile key and status.
   *
   * @param key - The unique identifier for the tile.
   * @param status - The current status of the tile.
   */
  private updateTile(key: string, status: TileStatus): void {
    const existing = this.tileEntities.get(key);
    if (existing) {
      this.updateEntity(existing, status);
    } else {
      const entity = this.createEntity(key, status);
      if (entity) {
        this.tileEntities.set(key, entity);
        const source = this.entityManager.layerManager.getOrCreateSource(this.layerId);
        source.entities.add(entity);
        this.updateEntity(entity, status); // Handle immediate removal if status is already loaded/error
      }
    }
    this.entityManager.requestRender();
  }

  /**
   * Creates a Cesium entity (rectangle) for a tile.
   *
   * @param key - The tile key to parse for coordinates.
   * @param status - The initial status of the tile.
   * @returns A Cesium entity representing the tile, or undefined if parsing fails.
   */
  private createEntity(key: string, status: TileStatus): Cesium.Entity | undefined {
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

    const entity = new Cesium.Entity({
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
        outlineWidth: 8,
        height: 10,   // Slightly above ground to prevent z-fighting
      },
    });
    (entity as any).selectable = false;
    return entity;
  }

  /**
   * Updates an existing Cesium entity with a new status color.
   *
   * @param entity - The entity to update.
   * @param status - The new status of the tile.
   */
  private updateEntity(entity: Cesium.Entity, status: TileStatus): void {
    const color = this.getStatusColor(status);
    if (entity.rectangle) {
      entity.rectangle.outlineColor = new Cesium.ConstantProperty(color) as any;
      entity.rectangle.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.1)) as any;
    }

    if (status === "loaded" || status === "error") {
      setTimeout(() => {
        const source = this.entityManager.layerManager.getOrCreateSource(this.layerId);
        source.entities.remove(entity);
        // Find and remove from map
        for (const [key, ent] of this.tileEntities.entries()) {
          if (ent === entity) {
            this.tileEntities.delete(key);
            break;
          }
        }
        this.entityManager.requestRender();
      }, 3000);
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
