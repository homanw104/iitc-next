import * as Cesium from "cesium";
import {
  generateTileKey,
  getDataZoomForMapZoom,
  getMapZoomTileParameters,
  latToTileIndex,
  lngToTileIndex
} from "../managers/tileRequestManager";
import { logManager } from "../managers/logManager";
import { setCookie } from "./browser";

// Height at zoom level 0, shows more tiles if higher
export const HEIGHT_AT_ZOOM_ZERO = 96000000;

// Default tile limit to load
const MAX_TILES_TO_LOAD = 2000;

let lastDataZoom: number | undefined;
let lastTileKeysCount: number | undefined;

/**
 * Calculate the tile keys based on the current view.
 *
 * @param viewer - Viewer to calculaate.
 */
export function calculateTileKeys(viewer: Cesium.Viewer): string[] {
  const camera = viewer.camera;
  const cartographic = camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lng = Cesium.Math.toDegrees(cartographic.longitude);
  const height = cartographic.height;

  const calculatedZoom = Math.round(Math.log2(HEIGHT_AT_ZOOM_ZERO / height));
  const mapZoom = isNaN(calculatedZoom) ? 0 : calculatedZoom;
  const dataZoom = getDataZoomForMapZoom(mapZoom);

  setCookie("ingress.intelmap.lat", lat.toFixed(6));
  setCookie("ingress.intelmap.lng", lng.toFixed(6));
  setCookie("ingress.intelmap.zoom", mapZoom.toString());

  const tileParams = getMapZoomTileParameters(dataZoom);
  const viewRect = camera.computeViewRectangle();

  if (viewRect) {
    const west = Cesium.Math.toDegrees(viewRect.west);
    const south = Cesium.Math.toDegrees(viewRect.south);
    const east = Cesium.Math.toDegrees(viewRect.east);
    const north = Cesium.Math.toDegrees(viewRect.north);

    const minX = lngToTileIndex(west, tileParams);
    const maxX = lngToTileIndex(east, tileParams);
    const minY = latToTileIndex(north, tileParams);
    const maxY = latToTileIndex(south, tileParams);

    const tileKeys: string[] = [];
    const tilesPerEdge = tileParams.tilesPerEdge;
    for (let x = minX; ; x = (x + 1) % tilesPerEdge) {
      for (let y = minY; y <= maxY; y++) {
        tileKeys.push(generateTileKey(tileParams, x, y));
        if (tileKeys.length >= MAX_TILES_TO_LOAD) {
          logManager.warn("CesiumViewer", "Too many tiles to load, truncating.");
          break;
        }
      }
      if (x === maxX || tileKeys.length >= MAX_TILES_TO_LOAD) break;
    }
    const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
    if (dataZoom <= 3 && lastDataZoom === dataZoom && tileKeys.length === lastTileKeysCount) {
      if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
        return [];
      }
    }

    lastDataZoom = dataZoom;
    lastTileKeysCount = tileKeys.length;

    return tileKeys;
  }

  return [];
}
