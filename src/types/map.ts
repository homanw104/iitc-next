import { FieldData, LinkData, PortalData } from "./ingress";

/**
 * Map position data including latitude, longitude, and zoom level.
 */
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
