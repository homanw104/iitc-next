/**
 * Defines shared portal label primitive state.
 *
 * PortalLabel combines the Cesium label primitive with cached text bounds,
 * layer membership, and fade state. Bounds are approximate screen-space values
 * used by overlap selection, while current/fade opacity fields are kept flat so
 * the fade loop can update them without allocating per frame.
 */

import type * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal";
import type { EntityPositionCallback } from "./entityPositionManager";
import type { PortalPrimitiveId } from "./portalManager";

export interface PortalLabel {
  data: PortalData;
  primitive: Cesium.Label | undefined;
  primitiveId: PortalPrimitiveId;
  position: Cesium.Cartesian3;
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
