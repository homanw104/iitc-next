/**
 * Runtime bridge for the Vite alias from "cesium" to this file.
 *
 * loadCesiumScript() first injects Cesium's UMD bundle, which populates
 * safeWindow.Cesium; this bridge then forwards existing "cesium" imports to it.
 *
 * The Vite Cesium global bridge plugin generates every named export from the
 * installed Cesium package at build time. This file only owns the runtime lookup.
 */

import { safeWindow } from "../../utils/window.ts";

type CesiumType = typeof import("cesium");
type WindowWithCesium = Window & typeof globalThis & {
  Cesium?: CesiumType;
};

const getCesium = (): CesiumType => {
  const cesium = (safeWindow as WindowWithCesium).Cesium;
  if (!cesium) throw new Error("Cesium has not been loaded");
  return cesium;
};

const Cesium = getCesium();

export default Cesium;
