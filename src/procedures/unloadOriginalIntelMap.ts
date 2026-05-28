/**
 * Contain functions for unloading the original intel map.
 */

import { logManager } from "../managers/logManager";

/**
 * Replaces the current document body with a new one to isolate the environment.
 *
 * @return {void}
 */
export default function unloadOriginalIntelMap(): void {
  logManager.debug("Original Map", "Unloading...");
  document.body = document.createElement("body");
}
