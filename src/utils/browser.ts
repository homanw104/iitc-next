/**
 * Helper functions for working with URLs and cookies.
 */

/**
 * Default zoom level when getting the initial map position from query params.
 */
const DEFAULT_ZOOM = 15;

/**
 * Retrieves a parameter from the URL query string.
 *
 * @param {string} param - The name of the parameter to retrieve.
 * @returns {string} The value of the parameter, or an empty string if not found.
 */
export function getURLParam(param: string): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param) || "";
}

/**
 * Retrieves the value of a cookie by name.
 *
 * @param {string} name - The name of the cookie to retrieve.
 * @returns {string|undefined} The value of the cookie, or undefined if not found.
 */
export function getCookie(name: string): string | undefined {
  const raw_cookies = document.cookie.split("; ");
  const cookies = raw_cookies.reduce<Record<string, string>>((acc, cookie) => {
    const [key, value] = cookie.split("=");
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
  return cookies[name];
}

/**
 * Sets a cookie with a specified name and value, with a default expiration time of 10 years.
 *
 * @param {string} name - The name of the cookie.
 * @param {string} value - The value of the cookie.
 * @param {number} [days=3650] - Optional: the number of days until the cookie expires (default is 10 years).
 */
export function setCookie(name: string, value: string, days: number = 3650): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

/**
 * Deletes a cookie by name.
 *
 * @param {string} name - The name of the cookie to delete.
 */
export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/**
 * Retrieves the last known map position from the URL parameters or cookies.
 * Prioritizes URL parameters over cookies. Return an object containing
 * the map's position and zoom level, or undefined if not found.
 *
 * @return {MapPosition?} - Position of the map or undefined if it cannot be found.
 */
import { MapPosition } from "../types/map";

export function getMapPosition(): MapPosition | undefined {
  let lat: number, lng: number, zoom: number;

  const latE6 = getURLParam("latE6");
  const lngE6 = getURLParam("lngE6");
  const ll = getURLParam("ll") || getURLParam("pll");
  const z = getURLParam("z");
  const latCookie = getCookie("ingress.intelmap.lat");
  const lngCookie = getCookie("ingress.intelmap.lng");
  const zoomCookie = getCookie("ingress.intelmap.zoom");

  // Email URL params
  if (latE6 && lngE6) {
    lat = parseInt(latE6) / 1e6;
    lng = parseInt(lngE6) / 1e6;
    zoom = parseInt(z || DEFAULT_ZOOM.toString());
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return undefined;
    return { lat, lng, zoom };
  }

  // Stock Intel URL params
  if (ll) {
    const parts = ll.split(",");
    lat = parseFloat(parts[0]);
    lng = parseFloat(parts[1]);
    zoom = parseInt(z || DEFAULT_ZOOM.toString());
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return undefined;
    return { lat, lng, zoom };
  }

  // Read from cookies
  if (latCookie && lngCookie) {
    lat = parseFloat(latCookie);
    lng = parseFloat(lngCookie);
    zoom = parseInt(zoomCookie || DEFAULT_ZOOM.toString());
    if (isNaN(lat) || isNaN(lng) || isNaN(zoom)) return undefined;
    return { lat, lng, zoom };
  }

  return undefined;
}
