import type * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import type { EntityPositionCallback } from "./entityPositionManager";

export interface PortalLabelEntity {
  data: PortalData;
  entity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
  wrappedText: string;
  screenBoxWidth: number;
  screenBoxHeight: number;
  linkCount: number;
  opacity: number;
  targetOpacity: number;
  fadeStartOpacity: number;
  fadeStartTime: number;
  currentLayerId: string;
}

export interface PortalLabelEntityScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PortalLabelEntityTextLayout {
  wrappedText: string;
  screenBoxWidth: number;
  screenBoxHeight: number;
}
