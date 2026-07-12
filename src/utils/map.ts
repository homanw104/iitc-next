/**
 * Utilities to transform coordinates.
 */

import * as Cesium from "cesium";
import type { Cartesian2, Ellipsoid } from "cesium";

export class AmapMercatorTilingScheme extends Cesium.WebMercatorTilingScheme {
  constructor(options: {
    ellipsoid?: Ellipsoid | undefined;
    numberOfLevelZeroTilesX?: number | undefined;
    numberOfLevelZeroTilesY?: number | undefined;
    rectangleSouthwestInMeters?: Cartesian2 | undefined;
    rectangleNortheastInMeters?: Cartesian2 | undefined
  }) {
    super(options);

    const projection = new Cesium.WebMercatorProjection();
    const internalTilingScheme = this as unknown as {
      _projection: {
        project: (cartographic: Cesium.Cartographic, result?: Cesium.Cartesian3) => Cesium.Cartesian3;
        unproject: (cartesian: Cesium.Cartesian3, result?: Cesium.Cartographic) => Cesium.Cartographic;
      };
    };

    internalTilingScheme._projection.project = function(cartographic: Cesium.Cartographic, result?: Cesium.Cartesian3): Cesium.Cartesian3 {
      const gcj02 = wgs84ToGcj02(
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
      );
      const cartesian = projection.project(
        new Cesium.Cartographic(
          Cesium.Math.toRadians(gcj02[0]),
          Cesium.Math.toRadians(gcj02[1]),
        ),
      );
      if (result) {
        result.x = cartesian.x;
        result.y = cartesian.y;
        result.z = cartesian.z;
        return result;
      }
      return cartesian;
    };

    internalTilingScheme._projection.unproject = function(cartesian: Cesium.Cartesian3, result?: Cesium.Cartographic): Cesium.Cartographic {
      const cartographic = projection.unproject(cartesian);
      const wgs84 = gcj02ToWgs84(
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
      );
      const res = new Cesium.Cartographic(
        Cesium.Math.toRadians(wgs84[0]),
        Cesium.Math.toRadians(wgs84[1]),
      );
      if (result) {
        result.longitude = res.longitude;
        result.latitude = res.latitude;
        result.height = res.height;
        return result;
      }
      return res;
    };
  }
}

function wgs84ToGcj02(lng: number, lat: number) {
  const [dLng, dLat] = calculateDelta(lng, lat);
  const mgLat = lat + dLat;
  const mgLng = lng + dLng;
  return [mgLng, mgLat];
}

function gcj02ToWgs84(lng: number, lat: number) {
  const [dLng, dLat] = calculateDelta(lng, lat);
  const mgLat = lat + dLat;
  const mgLng = lng + dLng;

  return [lng * 2 - mgLng, lat * 2 - mgLat];
}

function calculateDelta(lng: number, lat: number): [number, number] {
  const PI = Math.PI;
  const a = 6378245.0;
  const ee = 0.006693421622965943;

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);

  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);

  magic = 1 - ee * magic * magic;

  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);

  return [dLng, dLat];
}

function transformLat(lng: number, lat: number) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat +
    0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) +
    20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * Math.PI) +
    40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) +
    320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(lng: number, lat: number) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng +
    0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) +
    20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * Math.PI) +
    40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) +
    300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}
