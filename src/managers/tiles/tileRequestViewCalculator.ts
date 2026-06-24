/**
 * Calculates Intel tile keys from the current Cesium camera view.
 */

import * as Cesium from "cesium";
import { setCookie } from "../../utils/browser";
import { logManager } from "../system/logManager";
import {
  generateTileKey,
  getDataZoomForMapZoom,
  getMapZoomTileParameters,
  HEIGHT_AT_ZOOM_ZERO,
  latToTileIndex,
  lngToTileIndex,
} from "./tileRequestMath";

const LOG_TAG = "TileRequestViewCalculator";

// Default tile limit to load
const MAX_TILES_TO_LOAD = 1800;

/**
 * The most horizon-facing pitch allowed when computing the tile to refresh.
 *
 * Cesium camera pitch is negative when looking down: -90 degrees is top-down, and
 * 0 degrees is the horizon. Clamping prevents near-horizon views from producing
 * an overly broad rectangle.
 */
const MAX_VIEW_RECTANGLE_PITCH = Cesium.Math.toRadians(-50);

export class ViewTileCalculator {
  private lastDataZoom: number | undefined;
  private lastTileKeysCount: number | undefined;

  constructor(private readonly viewer: Cesium.Viewer) {}

  public calculateTileKeys(): string[] {
    const camera = this.viewer.camera;
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
    const viewRect = this.computeViewRectangle();

    if (!viewRect) return [];

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
          logManager.warn(LOG_TAG, "Too many tiles to load, truncating.");
          break;
        }
      }
      if (x === maxX || tileKeys.length >= MAX_TILES_TO_LOAD) break;
    }

    const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
    if (dataZoom <= 3 && this.lastDataZoom === dataZoom && tileKeys.length === this.lastTileKeysCount) {
      if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
        return [];
      }
    }

    this.lastDataZoom = dataZoom;
    this.lastTileKeysCount = tileKeys.length;

    return tileKeys;
  }

  public computeViewRectangle(
    maxPitch: number = MAX_VIEW_RECTANGLE_PITCH
  ): Cesium.Rectangle | undefined {
    const camera = this.viewer.camera;
    const pitch = Math.min(camera.pitch, maxPitch);
    const ellipsoid = this.viewer.scene.globe.ellipsoid;

    if (pitch === camera.pitch) {
      return camera.computeViewRectangle(ellipsoid);
    }

    const scene = this.viewer.scene;
    const clampedCamera = new Cesium.Camera(scene);
    clampedCamera.frustum = camera.frustum.clone();
    clampedCamera.setView({
      destination: Cesium.Cartesian3.clone(camera.positionWC),
      orientation: {
        heading: camera.heading,
        pitch,
        roll: camera.roll,
      },
      endTransform: Cesium.Matrix4.clone(camera.transform),
    });

    return clampedCamera.computeViewRectangle(ellipsoid);
  }
}
