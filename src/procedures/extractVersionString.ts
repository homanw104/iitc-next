/**
 * Extracts and sets the Niantic API version from the page.
 */

import { setApiVersion } from "../utils/network";
import { logger } from "../utils/logger";

/**
 * Extracts and sets the Niantic API version from the page.
 */
export default function extractVersionString(): void {
  logger.debug("Version", "Extracting version string...");
  const version = extractVersionFromScript();
  if (version) {
    setApiVersion(version);
    logger.info("Version", version);
  } else {
    logger.warn("Version", "Could not extract version. Requests may fail.");
  }
}

/**
 * Extracts the version from the gen_dashboard script filename.
 * e.g., /jsc/gen_dashboard_1359f9c6382cf1583dc7b8fa7021b573dcdccf6a.js
 */
export function extractVersionFromScript(): string | undefined {
  const script = document.querySelector("script[src^=\"/jsc/gen_dashboard_\"]");
  if (script) {
    const src = script.getAttribute("src") || "";
    const match = /gen_dashboard_([a-f0-9]{40})\.js/.exec(src);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}
