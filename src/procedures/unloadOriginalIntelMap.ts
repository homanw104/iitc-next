/**
 * Contain functions for unloading the original intel map.
 */

import { logger } from "../utils/logger";

/**
 * Replaces the current document body with a new one to isolate the environment.
 *
 * @return {void}
 */
export default function unloadOriginalIntelMap(): void {
  logger.debug("Original Map", "Unloading...");
  document.body = document.createElement("body");
}
