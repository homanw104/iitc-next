/**
 * Manages the visualization of tiles for debugging purposes.
 * Creates overlay rectangle primitives for each tile being loaded in the map.
 */

import * as Cesium from "cesium";
import type { LayerManager } from "../layer/layerManager";
import type { TileStatus } from "../tiles/tileRequestManager";
import { getMapZoomTileParameters, tileToLat, tileToLng } from "../tiles/tileRequestMath";

const DEBUG_TILE_LAYER_ID = "debug-tiles";
const DEBUG_TILE_OVERLAY_Z_INDEX = 0;
const DEBUG_TILE_FILL_ALPHA = 0.1;
const DEBUG_TILE_REMOVAL_DELAY_MS = 2000;

interface DebugTile {
  fillPrimitive: Cesium.Primitive;
  outlinePrimitive: Cesium.Primitive;
  removalTimeout: number | undefined;
}

export class DebugTileManager {
  private readonly debugTiles: Map<string, DebugTile> = new Map();

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
  ) {}

  public updateTile(key: string, status: TileStatus): void {
    this.removeTilePrimitives(key);

    const tilePrimitives = this.createTilePrimitives(key, status);
    if (!tilePrimitives) return;

    this.debugTiles.set(key, tilePrimitives);
    if (status === "loaded" || status === "error") this.scheduleTileRemoval(key, tilePrimitives);
    this.viewer.scene.requestRender();
  }

  private createTilePrimitives(key: string, status: TileStatus): DebugTile | undefined {
    const rectangle = getTileRectangle(key);
    if (!rectangle) return undefined;

    const color = getStatusColor(status);
    const layer = this.layerManager.getOrCreateOverlayLayer(DEBUG_TILE_LAYER_ID, DEBUG_TILE_OVERLAY_Z_INDEX);
    const fillPrimitive = layer.addPrimitive(createTileFillPrimitive(rectangle, color));
    const outlinePrimitive = layer.addPrimitive(createTileOutlinePrimitive(rectangle, color));

    return { fillPrimitive, outlinePrimitive, removalTimeout: undefined };
  }

  private removeTilePrimitives(key: string): boolean {
    const tilePrimitives = this.debugTiles.get(key);
    if (!tilePrimitives) return false;

    if (tilePrimitives.removalTimeout !== undefined) {
      window.clearTimeout(tilePrimitives.removalTimeout);
      tilePrimitives.removalTimeout = undefined;
    }

    const layer = this.layerManager.getOrCreateOverlayLayer(DEBUG_TILE_LAYER_ID, DEBUG_TILE_OVERLAY_Z_INDEX);
    layer.removePrimitive(tilePrimitives.fillPrimitive);
    layer.removePrimitive(tilePrimitives.outlinePrimitive);
    this.debugTiles.delete(key);
    return true;
  }

  private scheduleTileRemoval(key: string, tilePrimitives: DebugTile): void {
    tilePrimitives.removalTimeout = window.setTimeout(() => {
      this.removeTilePrimitives(key);
      this.viewer.scene.requestRender();
    }, DEBUG_TILE_REMOVAL_DELAY_MS);
  }
}

function getTileRectangle(key: string): Cesium.Rectangle | undefined {
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

  return Cesium.Rectangle.fromDegrees(
    finalWest,
    finalSouth,
    finalEast,
    finalNorth,
  );
}

function createTileFillPrimitive(rectangle: Cesium.Rectangle, color: Cesium.Color): Cesium.Primitive {
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle,
        height: 0,
        vertexFormat: Cesium.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(DEBUG_TILE_FILL_ALPHA)),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: true,
    }),
    allowPicking: false,
    asynchronous: false,
  });
}

function createTileOutlinePrimitive(rectangle: Cesium.Rectangle, color: Cesium.Color): Cesium.Primitive {
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleOutlineGeometry({
        rectangle,
        height: 0,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    allowPicking: false,
    asynchronous: false,
  });
}

function getStatusColor(status: TileStatus): Cesium.Color {
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
