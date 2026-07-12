/**
 * Portal label text, opacity, and anchor layout helpers.
 *
 * The label manager owns primitive lifecycle and fade scheduling; this module keeps
 * the small geometry/display calculations that are reused by overlap checks and
 * Cesium label primitives. The size values are screen-space estimates, so they
 * stay cheap and deterministic instead of measuring rendered text.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal";
import { wrapLabelText } from "../../utils/text";
import { createPortalNearFarScalar, getPortalNearFarScale, PORTAL_POINT_PIXEL_SIZE } from "./portalManager";
import type { PortalLabel, PortalLabelTextLayout } from "./portalLabelTypes";

const PORTAL_LABEL_FONT_SIZE_PX = 12;
const PORTAL_LABEL_LINE_HEIGHT_PX = 14;
const PORTAL_LABEL_FONT_FAMILY = "sans-serif";
export const PORTAL_LABEL_FONT = `${PORTAL_LABEL_FONT_SIZE_PX}px/${PORTAL_LABEL_LINE_HEIGHT_PX}px ${PORTAL_LABEL_FONT_FAMILY}`;
const PORTAL_LABEL_MAX_LINE_LENGTH = 24;
const PORTAL_LABEL_AVERAGE_CHARACTER_WIDTH_PX = 7;
const PORTAL_LABEL_POINT_GAP_PX = 6;
export const PORTAL_LABEL_OUTLINE_WIDTH = 4;
export const PORTAL_LABEL_DISABLE_DEPTH_TEST_DISTANCE = Number.POSITIVE_INFINITY;

export const PORTAL_LABEL_INITIAL_OPACITY = 0;
export const PORTAL_LABEL_VISIBLE_OPACITY = 1;
export const PORTAL_LABEL_HIDDEN_OPACITY = 0;

const labelFillColorScratch = new Cesium.Color();
const labelOutlineColorScratch = new Cesium.Color();

export function getPortalLabelLinkCount(data: PortalData): number {
  if (!data.links) return 0;
  else return new Set(data.links.map((link) => link.guid)).size;
}

export function getPortalLabelTextLayout(text: string): PortalLabelTextLayout {
  const wrappedText = wrapLabelText(text, PORTAL_LABEL_MAX_LINE_LENGTH);
  const lines = wrappedText.split("\n");
  const maxLineLength = lines.reduce((maxLength, line) => Math.max(maxLength, line.length), 0);
  return {
    wrappedText,
    screenBoxWidth: maxLineLength * PORTAL_LABEL_AVERAGE_CHARACTER_WIDTH_PX + PORTAL_LABEL_OUTLINE_WIDTH * 2,
    screenBoxHeight: lines.length * PORTAL_LABEL_LINE_HEIGHT_PX + PORTAL_LABEL_OUTLINE_WIDTH * 2,
  };
}

export function setPortalLabelCurrentOpacity(label: PortalLabel, opacity: number): boolean {
  const clampedOpacity = Cesium.Math.clamp(
    opacity,
    PORTAL_LABEL_HIDDEN_OPACITY,
    PORTAL_LABEL_VISIBLE_OPACITY,
  );
  if (Math.abs(label.currentOpacity - clampedOpacity) < Cesium.Math.EPSILON6) return false;

  label.currentOpacity = clampedOpacity;
  if (label.primitive) {
    label.primitive.fillColor = Cesium.Color.WHITE.withAlpha(clampedOpacity, labelFillColorScratch);
    label.primitive.outlineColor = Cesium.Color.BLACK.withAlpha(clampedOpacity, labelOutlineColorScratch);
  }
  return true;
}

export function getPortalLabelFadeTargetOpacity(label: PortalLabel): number {
  return label.fadeTargetOpacity;
}

export function createPortalLabelPixelOffset(): Cesium.Cartesian2 {
  const nearFarScale = createPortalNearFarScalar();
  return new Cesium.Cartesian2(0, getPortalLabelPixelOffsetY(nearFarScale.near));
}

export function createPortalLabelPixelOffsetScaleByDistance(): Cesium.NearFarScalar {
  const nearFarScale = createPortalNearFarScalar();
  const nearOffsetY = getPortalLabelPixelOffsetY(nearFarScale.near);
  const farOffsetY = getPortalLabelPixelOffsetY(nearFarScale.far);

  return new Cesium.NearFarScalar(
    nearFarScale.near,
    1,
    nearFarScale.far,
    farOffsetY / nearOffsetY,
  );
}

export function getPortalLabelPixelOffsetY(distance: number): number {
  const scale = getPortalNearFarScale(distance);

  return -(PORTAL_POINT_PIXEL_SIZE * scale / 2 + PORTAL_LABEL_POINT_GAP_PX);
}
