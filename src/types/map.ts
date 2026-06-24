/**
 * Type definitions for the map.
 */

import type { FieldData, LinkData, PortalData } from "./ingress";

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

export interface ParsedEntities {
  portals: PortalData[];
  links: LinkData[];
  fields: FieldData[];
}
