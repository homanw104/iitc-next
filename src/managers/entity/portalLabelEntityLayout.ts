/**
 * Utilities for getting portal label entity layout size.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import { wrapLabelText } from "../../utils/text.ts";
import { getPortalNearFarScale, PORTAL_POINT_PIXEL_SIZE } from "./portalEntityManager.ts";
import type { PortalLabel, PortalLabelEntityTextLayout } from "./portalLabelEntityTypes";

export const PORTAL_LABEL_ENTITY_FONT_SIZE_PX = 12;
export const PORTAL_LABEL_ENTITY_LINE_HEIGHT_PX = 14;
export const PORTAL_LABEL_ENTITY_FONT_FAMILY = "sans-serif";
export const PORTAL_LABEL_ENTITY_FONT = `${PORTAL_LABEL_ENTITY_FONT_SIZE_PX}px/${PORTAL_LABEL_ENTITY_LINE_HEIGHT_PX}px ${PORTAL_LABEL_ENTITY_FONT_FAMILY}`;
export const PORTAL_LABEL_ENTITY_MAX_LINE_LENGTH = 24;
export const PORTAL_LABEL_ENTITY_AVERAGE_CHARACTER_WIDTH_PX = 7;
export const PORTAL_LABEL_ENTITY_OUTLINE_WIDTH = 8;
export const PORTAL_LABEL_ENTITY_POINT_GAP_PX = 6;
export const PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE = Number.POSITIVE_INFINITY;

export const PORTAL_LABEL_ENTITY_INITIAL_OPACITY = 0;
export const PORTAL_LABEL_ENTITY_VISIBLE_OPACITY = 1;
export const PORTAL_LABEL_ENTITY_HIDDEN_OPACITY = 0;

export function getPortalLabelEntityLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (data.isPlaceholder || level === 0) {
    return `portals-label-placeholder-${team}`;
  }
  return `portals-label-l${level}-${team}`;
}

export function getPortalLabelEntityLinkCount(data: PortalData): number {
  if (!data.links) return 0;

  return new Set(data.links.map((link) => link.guid)).size;
}

export function getPortalLabelEntityTextLayout(text: string): PortalLabelEntityTextLayout {
  const wrappedText = wrapLabelText(text, PORTAL_LABEL_ENTITY_MAX_LINE_LENGTH);
  const lines = wrappedText.split("\n");
  const maxLineLength = lines.reduce((maxLength, line) => Math.max(maxLength, line.length), 0);

  return {
    wrappedText,
    screenBoxWidth: maxLineLength * PORTAL_LABEL_ENTITY_AVERAGE_CHARACTER_WIDTH_PX + PORTAL_LABEL_ENTITY_OUTLINE_WIDTH * 2,
    screenBoxHeight: lines.length * PORTAL_LABEL_ENTITY_LINE_HEIGHT_PX + PORTAL_LABEL_ENTITY_OUTLINE_WIDTH * 2,
  };
}

export function setPortalLabelEntityColorCallbackProperties(label: PortalLabel): void {
  if (!label.entity.label) return;

  label.entity.label.fillColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.WHITE.withAlpha(label.opacity, result), false);
  label.entity.label.outlineColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.BLACK.withAlpha(label.opacity, result), false);
}

export function setPortalLabelEntityOpacity(label: PortalLabel, opacity: number): boolean {
  const clampedOpacity = Cesium.Math.clamp(
    opacity,
    PORTAL_LABEL_ENTITY_HIDDEN_OPACITY,
    PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  );
  if (Math.abs(label.opacity - clampedOpacity) < Cesium.Math.EPSILON6) return false;

  label.opacity = clampedOpacity;
  return true;
}

export function createPortalLabelEntityPixelOffsetCallback(
  viewer: Cesium.Viewer,
  getPosition: (time: Cesium.JulianDate) => Cesium.Cartesian3 | undefined,
): Cesium.CallbackProperty {
  return new Cesium.CallbackProperty((time, result) => {
    const offset = result ?? new Cesium.Cartesian2();
    const position = getPosition(time ?? viewer.clock.currentTime);
    const distance = position ? Cesium.Cartesian3.distance(viewer.camera.positionWC, position) : 0;

    offset.x = 0;
    offset.y = getPortalLabelEntityPixelOffsetY(distance);
    return offset;
  }, false);
}

export function getPortalLabelEntityPixelOffsetY(distance: number): number {
  const scale = getPortalNearFarScale(distance);

  return -(PORTAL_POINT_PIXEL_SIZE * scale / 2 + PORTAL_LABEL_ENTITY_POINT_GAP_PX);
}

export function getPortalLabelEntityPosition(
  label: PortalLabel,
  time: Cesium.JulianDate,
): Cesium.Cartesian3 | undefined {
  return label.entity.position?.getValue(time);
}
