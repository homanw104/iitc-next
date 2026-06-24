import * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import { wrapLabelText } from "../../utils/text.ts";
import type { PortalLabelEntity, PortalLabelEntityTextLayout } from "./portalLabelEntityTypes";

export const PORTAL_LABEL_ENTITY_FONT_SIZE_PX = 12;
export const PORTAL_LABEL_ENTITY_LINE_HEIGHT_PX = 14;
export const PORTAL_LABEL_ENTITY_FONT_FAMILY = "sans-serif";
export const PORTAL_LABEL_ENTITY_FONT = `${PORTAL_LABEL_ENTITY_FONT_SIZE_PX}px/${PORTAL_LABEL_ENTITY_LINE_HEIGHT_PX}px ${PORTAL_LABEL_ENTITY_FONT_FAMILY}`;
export const PORTAL_LABEL_ENTITY_MAX_LINE_LENGTH = 24;
export const PORTAL_LABEL_ENTITY_AVERAGE_CHARACTER_WIDTH_PX = 7;
export const PORTAL_LABEL_ENTITY_OUTLINE_WIDTH = 8;
export const PORTAL_LABEL_ENTITY_PIXEL_OFFSET_Y = -16;
export const PORTAL_LABEL_ENTITY_DISABLE_DEPTH_TEST_DISTANCE = Number.POSITIVE_INFINITY;

export const PORTAL_LABEL_ENTITY_INITIAL_OPACITY = 0;
export const PORTAL_LABEL_ENTITY_VISIBLE_OPACITY = 1;
export const PORTAL_LABEL_ENTITY_HIDDEN_OPACITY = 0;

export function getPortalLabelEntityLayerId(data: PortalData): string {
  return `portals-label-${data.team.toLowerCase()}`;
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

export function setPortalLabelEntityColorCallbackProperties(label: PortalLabelEntity): void {
  if (!label.entity.label) return;

  label.entity.label.fillColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.WHITE.withAlpha(label.opacity, result), false);
  label.entity.label.outlineColor = new Cesium.CallbackProperty((_time, result) =>
    Cesium.Color.BLACK.withAlpha(label.opacity, result), false);
}

export function setPortalLabelEntityOpacity(label: PortalLabelEntity, opacity: number): boolean {
  const clampedOpacity = Cesium.Math.clamp(
    opacity,
    PORTAL_LABEL_ENTITY_HIDDEN_OPACITY,
    PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  );
  if (Math.abs(label.opacity - clampedOpacity) < Cesium.Math.EPSILON6) return false;

  label.opacity = clampedOpacity;
  return true;
}

export function getPortalLabelEntityPosition(
  label: PortalLabelEntity,
  time: Cesium.JulianDate,
): Cesium.Cartesian3 | undefined {
  return label.entity.position?.getValue(time);
}
