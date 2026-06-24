/**
 * Pure tile math for Intel map data requests.
 */

// Height at zoom level 0, shows more tiles if higher
export const HEIGHT_AT_ZOOM_ZERO = 96000000;

/**
 * Defines the number of tiles per edge to zoom into at each level of detail.
 */
const DEFAULT_ZOOM_TO_TILES_PER_EDGE: number[] = [1, 1, 1, 40, 40, 80, 80, 320, 1000, 2000, 2000, 4000, 8000, 16000, 16000, 32000];

/**
 * Default Intel data levels by map zoom.
 */
const DEFAULT_ZOOM_TO_LEVEL: number[] = [8, 8, 8, 8, 7, 7, 7, 6, 6, 5, 4, 4, 3, 2, 2, 1, 1];

/**
 * Default minimum link length by map zoom.
 */
const DEFAULT_ZOOM_TO_LINK_LENGTH: number[] = [200000, 200000, 200000, 200000, 200000, 60000, 60000, 10000, 5000, 2500, 2500, 800, 300, 0, 0];

/**
 * Represents parameters for configuring a tile in a grid or map system.
 */
export interface TileParams {
  level: number;
  tilesPerEdge: number;
  minLinkLength: number;
  hasPortals: boolean;
  zoom: number;
}

export function getMapZoomTileParameters(zoom: number): TileParams {
  // Clamp zoom to [0, max supported zoom]
  const maxZoom = DEFAULT_ZOOM_TO_TILES_PER_EDGE.length - 1;
  const clampedZoom = Math.max(0, Math.min(maxZoom, zoom));

  return {
    zoom: clampedZoom,
    level: DEFAULT_ZOOM_TO_LEVEL[clampedZoom] ?? 0,
    tilesPerEdge: DEFAULT_ZOOM_TO_TILES_PER_EDGE[clampedZoom] ?? 32000,
    minLinkLength: DEFAULT_ZOOM_TO_LINK_LENGTH[clampedZoom] ?? 0,
    hasPortals: clampedZoom >= DEFAULT_ZOOM_TO_LINK_LENGTH.length || DEFAULT_ZOOM_TO_LINK_LENGTH[clampedZoom] === 0,
  };
}

export function getDataZoomForMapZoom(zoom: number): number {
  if (isNaN(zoom) || zoom < 3) {
    return 3;
  }

  if (zoom > 21) {
    zoom = 21;
  }

  // To improve caching performance, use the same zoom level for data requests
  // if the tile parameters (tilesPerEdge, level, hasPortals) are identical.
  const origParams = getMapZoomTileParameters(zoom);
  while (zoom > 3) {
    const nextParams = getMapZoomTileParameters(zoom - 1);
    if (
      nextParams.tilesPerEdge !== origParams.tilesPerEdge ||
      nextParams.hasPortals !== origParams.hasPortals ||
      nextParams.level * (nextParams.hasPortals ? 1 : 0) !== origParams.level * (origParams.hasPortals ? 1 : 0)
    ) {
      break;
    }
    zoom--;
  }

  return zoom;
}

export function lngToTileIndex(lng: number, params: TileParams): number {
  const x = Math.floor(((lng + 180) / 360) * params.tilesPerEdge);
  return Math.max(0, Math.min(params.tilesPerEdge - 1, x));
}

export function latToTileIndex(lat: number, params: TileParams): number {
  // Clamp latitude to the range supported by Web Mercator to avoid math errors at the poles.
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * params.tilesPerEdge);
  return Math.max(0, Math.min(params.tilesPerEdge - 1, y));
}

export function tileToLat(y: number, params: TileParams): number {
  const n = Math.PI - (2 * Math.PI * y) / params.tilesPerEdge;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileToLng(x: number, params: TileParams): number {
  return (x / params.tilesPerEdge) * 360 - 180;
}

export function generateTileKey(params: TileParams, x: number, y: number): string {
  return `${params.zoom}_${x}_${y}_${params.level}_8_100`;
}
