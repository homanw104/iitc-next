/**
 * Extracts and sets the Niantic API version from the page.
 *
 * Extracts the version from the gen_dashboard script filename.
 * e.g., /jsc/gen_dashboard_1359f9c6382cf1583dc7b8fa7021b573dcdccf6a.js
 */

import { setApiVersion } from "../utils/network";
import { logManager } from "../managers/logManager";

export default function extractVersionString(): void {
  const version = extractVersionFromScript();
  if (version) {
    setApiVersion(version);
    logManager.debug("Version", "Extracted version string");
  } else {
    logManager.warn("Version", "Could not extract version: Requests may fail");
  }
}

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
