/**
 * Defines the public capabilities exposed by the Draw Lines plugin.
 */

import type * as Cesium from "cesium";

export const DRAW_LINES_PLUGIN_ID = "draw-lines";

export interface DrawLineData {
  id: string;
  name?: string;
  positions: Cesium.Cartesian3[];
}

export interface DrawLineAppearanceOverride {
  color?: string;
  alpha?: number;
  width?: number;
  dashLength?: number | null;
}

export type DrawLinesChangedCallback = () => void;

export interface DrawLinesReader {
  forEachDrawLineData(callback: (data: DrawLineData) => void): void;
  addDrawLinesChangedListener(callback: DrawLinesChangedCallback): void;
  removeDrawLinesChangedListener(callback: DrawLinesChangedCallback): void;
}

export interface DrawLinesAppearanceController {
  setAppearanceOverrides(
    ownerId: string,
    overrides: ReadonlyMap<string, DrawLineAppearanceOverride>,
  ): void;
  clearAppearanceOverrides(ownerId: string): void;
}

export function isDrawLinesReader(value: unknown): value is DrawLinesReader {
  if (!isObject(value)) return false;

  return typeof value.forEachDrawLineData === "function" &&
    typeof value.addDrawLinesChangedListener === "function" &&
    typeof value.removeDrawLinesChangedListener === "function";
}

export function isDrawLinesAppearanceController(value: unknown): value is DrawLinesAppearanceController {
  if (!isObject(value)) return false;

  return typeof value.setAppearanceOverrides === "function" &&
    typeof value.clearAppearanceOverrides === "function";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
