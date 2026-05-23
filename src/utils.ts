/**
 * Helper functions for working with URLs and cookies.
 */

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
  const raw_cookies = document.cookie.split("; ")
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
