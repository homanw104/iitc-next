/**
 * Helper functions for map functionality.
 */

import { getCookie, getURLParam } from "./utils";

const DEFAULT_ZOOM = 15;

export interface MapPosition {
  center: [number, number];
  zoom: number;
}

/**
 * Retrieves the last known map position from the URL parameters or cookies.
 * Prioritizes URL parameters over cookies. Return an object containing
 * the map's position and zoom level, or undefined if not found.
 *
 * @return {MapPosition?} - Position of the map or undefined if it cannot be found.
 */
export function getPosition(): MapPosition | undefined {
  let lat: number, lng: number, zoom: number;

  const latE6 = getURLParam("latE6");
  const lngE6 = getURLParam("lngE6");
  const ll = getURLParam("ll") || getURLParam("pll");
  const z = getURLParam("z");
  const latCookie = getCookie("ingress.intelmap.lat");
  const lngCookie = getCookie("ingress.intelmap.lng");
  const zoomCookie = getCookie("ingress.intelmap.zoom");

  // Email URL params
  if (latE6 && lngE6 && z) {
    lat = parseInt(latE6) / 1e6;
    lng = parseInt(lngE6) / 1e6;
    zoom = parseInt(z);
    return normLLZ(lat, lng, zoom);
  }

  // Stock Intel URL params
  if (ll && z) {
    lat = parseFloat(ll.split(",")[0]);
    lng = parseFloat(ll.split(",")[1]);
    zoom = parseInt(z);
    return normLLZ(lat, lng, zoom);
  }

  // Read from cookies
  if (latCookie && lngCookie) {
    lat = parseFloat(latCookie);
    lng = parseFloat(lngCookie);
    zoom = parseInt(zoomCookie || DEFAULT_ZOOM.toString());
    return normLLZ(lat, lng, zoom);
  }

  return undefined;
}

/**
 * Normalizes latitude, longitude, and zoom values.
 * Ensures that the values are valid numbers, providing defaults if necessary.
 *
 * @param {number} lat - Latitude value
 * @param {number} lng - Longitude value
 * @param {number} zoom - Zoom level value
 * @returns {Object} An object containing normalized center (latitude and longitude) and zoom level.
 */
function normLLZ(lat: number, lng: number, zoom: number): MapPosition {
  return {
    center: [lat || 0, lng || 0],
    zoom: zoom || DEFAULT_ZOOM,
  };
}
