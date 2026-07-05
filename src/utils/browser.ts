/**
 * Helper functions for working with URLs and cookies.
 */

// Default zoom level when getting the initial map position from query params
const DEFAULT_ZOOM = 15;

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

export function getURLParam(param: string): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param) || "";
}

export function getCookie(name: string): string | undefined {
  const raw_cookies = document.cookie.split("; ");
  const cookies = raw_cookies.reduce<Record<string, string>>((acc, cookie) => {
    const [key, value] = cookie.split("=");
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
  return cookies[name];
}

export function setCookie(name: string, value: string, days: number = 3650): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

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
