/**
 * Extracts and sets the Niantic API version from the page.
 */

import { extractVersionFromScript } from "../utils/document";
import { setApiVersion } from "../utils/network";

/**
 * Extracts and sets the Niantic API version from the page.
 */
export default function loadVersionString(): void {
  const version = extractVersionFromScript();
  if (version) {
    setApiVersion(version);
  } else {
    console.warn("Could not extract Niantic version. Requests may fail.");
  }
}
