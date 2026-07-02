/**
 * Shared portal label entity state.
 *
 * PortalLabel combines the Cesium entity reference with cached text bounds,
 * layer membership, and fade state. Bounds are approximate screen-space values
 * used by overlap selection, while current/fade opacity fields are kept flat so
 * the fade loop can update them without allocating per frame.
 */

import type * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import type { EntityPositionCallback } from "./entityPositionManager";

export interface PortalLabel {
  data: PortalData;
  entity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
  wrappedText: string;
  screenBoxWidth: number;
  screenBoxHeight: number;
  isFallbackPosition: boolean;
  currentOpacity: number;
  fadeStartOpacity: number;
  fadeTargetOpacity: number;
  fadeStartTime: number;
  firstShownAt: number | undefined;
  linkCount: number;
  currentLayerId: string;
}

export interface PortalLabelScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PortalLabelTextLayout {
  wrappedText: string;
  screenBoxWidth: number;
  screenBoxHeight: number;
}
