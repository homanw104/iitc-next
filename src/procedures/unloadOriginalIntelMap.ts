/**
 * Contain functions for unloading the original intel map.
 */

/**
 * Replaces the current document body with a new one to isolate the environment.
 *
 * @return {void}
 */
export default function unloadOriginalIntelMap(): void {
  document.body = document.createElement("body");
}
