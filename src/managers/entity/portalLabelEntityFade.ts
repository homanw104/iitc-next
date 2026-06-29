/**
 * Portal label fade state helpers.
 *
 * The manager decides when labels should be visible; this module only updates
 * the flat fade fields on PortalLabel and keeps the Cesium entity show flag in
 * sync once a fade-to-hidden finishes. The result is a small numeric status so
 * the animation loop can avoid per-label object allocations.
 */

import * as Cesium from "cesium";
import {
  PORTAL_LABEL_ENTITY_HIDDEN_OPACITY,
  PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  getPortalLabelEntityFadeTargetOpacity,
  setPortalLabelEntityCurrentOpacity,
} from "./portalLabelEntityLayout";
import type { PortalLabel } from "./portalLabelEntityTypes";

const LABEL_FADE_DURATION_MS = 200;

export const PORTAL_LABEL_ENTITY_FADE_CHANGED = 1;
export const PORTAL_LABEL_ENTITY_FADE_COMPLETE = 2;
export const PORTAL_LABEL_ENTITY_FADE_CHANGED_COMPLETE = 3;

export type PortalLabelEntityFadeResult = 0 | 1 | 2 | 3;

export function setPortalLabelEntityTargetVisibility(label: PortalLabel, visible: boolean): boolean {
  const targetOpacity = visible ? PORTAL_LABEL_ENTITY_VISIBLE_OPACITY : PORTAL_LABEL_ENTITY_HIDDEN_OPACITY;
  if (getPortalLabelEntityFadeTargetOpacity(label) === targetOpacity) return false;

  const startTime = performance.now();
  label.fadeStartOpacity = label.currentOpacity;
  label.fadeTargetOpacity = targetOpacity;
  label.fadeStartTime = startTime;
  if (visible) {
    label.entity.show = true;
    label.firstShownAt ??= startTime;
  }

  return true;
}

export function updatePortalLabelEntityFade(label: PortalLabel, timestamp: number): PortalLabelEntityFadeResult {
  const progress = Cesium.Math.clamp((timestamp - label.fadeStartTime) / LABEL_FADE_DURATION_MS, 0, 1);
  const opacity = Cesium.Math.lerp(label.fadeStartOpacity, label.fadeTargetOpacity, smoothstep(progress));
  let changed = setPortalLabelEntityCurrentOpacity(label, opacity);

  if (progress < 1) return changed ? PORTAL_LABEL_ENTITY_FADE_CHANGED : 0;

  if (setPortalLabelEntityCurrentOpacity(label, label.fadeTargetOpacity)) {
    changed = true;
  }
  if (isPortalLabelEntityFadeTargetHidden(label) && label.entity.show) {
    label.entity.show = false;
    changed = true;
  }

  return changed ? PORTAL_LABEL_ENTITY_FADE_CHANGED_COMPLETE : PORTAL_LABEL_ENTITY_FADE_COMPLETE;
}

export function didPortalLabelEntityFadeChange(result: PortalLabelEntityFadeResult): boolean {
  return result === PORTAL_LABEL_ENTITY_FADE_CHANGED ||
    result === PORTAL_LABEL_ENTITY_FADE_CHANGED_COMPLETE;
}

export function isPortalLabelEntityFadeComplete(result: PortalLabelEntityFadeResult): boolean {
  return result === PORTAL_LABEL_ENTITY_FADE_COMPLETE ||
    result === PORTAL_LABEL_ENTITY_FADE_CHANGED_COMPLETE;
}

export function isPortalLabelEntityFadeTargetVisible(label: PortalLabel): boolean {
  return getPortalLabelEntityFadeTargetOpacity(label) === PORTAL_LABEL_ENTITY_VISIBLE_OPACITY;
}

export function isPortalLabelEntityFadingOut(label: PortalLabel): boolean {
  return label.entity.show &&
    isPortalLabelEntityFadeTargetHidden(label) &&
    label.currentOpacity > PORTAL_LABEL_ENTITY_HIDDEN_OPACITY + Cesium.Math.EPSILON6;
}

function isPortalLabelEntityFadeTargetHidden(label: PortalLabel): boolean {
  return getPortalLabelEntityFadeTargetOpacity(label) === PORTAL_LABEL_ENTITY_HIDDEN_OPACITY;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
