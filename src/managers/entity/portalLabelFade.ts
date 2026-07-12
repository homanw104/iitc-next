/**
 * Portal label fade state helpers.
 *
 * The manager decides when labels should be visible; this module only updates
 * the flat fade fields on PortalLabel and keeps the Cesium primitive show flag
 * in sync once a fade-to-hidden finishes. The result is a small numeric status,
 * so the animation loop can avoid per-label object allocations.
 */

import * as Cesium from "cesium";
import {
  PORTAL_LABEL_HIDDEN_OPACITY,
  PORTAL_LABEL_VISIBLE_OPACITY,
  getPortalLabelFadeTargetOpacity,
  setPortalLabelCurrentOpacity,
} from "./portalLabelLayout";
import type { PortalLabel } from "./portalLabelTypes";

const LABEL_FADE_DURATION_MS = 200;

const PORTAL_LABEL_FADE_CHANGED = 1;
const PORTAL_LABEL_FADE_COMPLETE = 2;
const PORTAL_LABEL_FADE_CHANGED_COMPLETE = 3;

export type PortalLabelFadeResult = 0 | 1 | 2 | 3;

export function setPortalLabelTargetVisibility(label: PortalLabel, visible: boolean): boolean {
  const targetOpacity = visible ? PORTAL_LABEL_VISIBLE_OPACITY : PORTAL_LABEL_HIDDEN_OPACITY;
  if (getPortalLabelFadeTargetOpacity(label) === targetOpacity) return false;

  const startTime = performance.now();
  label.fadeStartOpacity = label.currentOpacity;
  label.fadeTargetOpacity = targetOpacity;
  label.fadeStartTime = startTime;
  if (visible && label.primitive) {
    label.primitive.show = true;
    label.firstShownAt ??= startTime;
  }

  return true;
}

export function updatePortalLabelFade(label: PortalLabel, timestamp: number): PortalLabelFadeResult {
  const progress = Cesium.Math.clamp((timestamp - label.fadeStartTime) / LABEL_FADE_DURATION_MS, 0, 1);
  const opacity = Cesium.Math.lerp(label.fadeStartOpacity, label.fadeTargetOpacity, smoothstep(progress));
  let changed = setPortalLabelCurrentOpacity(label, opacity);

  if (progress < 1) return changed ? PORTAL_LABEL_FADE_CHANGED : 0;

  if (setPortalLabelCurrentOpacity(label, label.fadeTargetOpacity)) {
    changed = true;
  }
  if (isPortalLabelFadeTargetHidden(label) && label.primitive?.show) {
    label.primitive.show = false;
    changed = true;
  }

  return changed ? PORTAL_LABEL_FADE_CHANGED_COMPLETE : PORTAL_LABEL_FADE_COMPLETE;
}

export function didPortalLabelFadeChange(result: PortalLabelFadeResult): boolean {
  return result === PORTAL_LABEL_FADE_CHANGED ||
    result === PORTAL_LABEL_FADE_CHANGED_COMPLETE;
}

export function isPortalLabelFadeComplete(result: PortalLabelFadeResult): boolean {
  return result === PORTAL_LABEL_FADE_COMPLETE ||
    result === PORTAL_LABEL_FADE_CHANGED_COMPLETE;
}

export function isPortalLabelFadeTargetVisible(label: PortalLabel): boolean {
  return getPortalLabelFadeTargetOpacity(label) === PORTAL_LABEL_VISIBLE_OPACITY;
}

export function isPortalLabelFadingOut(label: PortalLabel): boolean {
  return label.primitive?.show === true &&
    isPortalLabelFadeTargetHidden(label) &&
    label.currentOpacity > PORTAL_LABEL_HIDDEN_OPACITY + Cesium.Math.EPSILON6;
}

function isPortalLabelFadeTargetHidden(label: PortalLabel): boolean {
  return getPortalLabelFadeTargetOpacity(label) === PORTAL_LABEL_HIDDEN_OPACITY;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
