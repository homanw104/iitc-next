/**
 * Extracts and sets the Niantic API version from the page.
 *
 * Extracts the version from the gen_dashboard script filename.
 * e.g., /jsc/gen_dashboard_1359f9c6382cf1583dc7b8fa7021b573dcdccf6a.js
 */

import { getApiVersion, setApiVersion } from "../utils/network";
import { logManager } from "../managers/system/logManager";

const LOG_TAG = "ExtractVersionString";
const VERSION_STORAGE_KEY = "iitc-next-api-version";

export default function extractVersionString(): void {
  const version = extractVersionFromScript();
  if (version) {
    setApiVersion(version);
    storeVersion(version);
    logManager.debug(LOG_TAG, `Extracted version string ${version}`);
  } else if (getStoredVersion()) {
    const storedVersion = getStoredVersion()!;
    setApiVersion(storedVersion);
    logManager.debug(LOG_TAG, `Using stored version string ${storedVersion}`);
  } else if (getApiVersion()) {
    logManager.debug(LOG_TAG, "Using previously extracted version string");
  } else {
    logManager.warn(LOG_TAG, "Could not extract version: Requests may fail");
  }
}

function extractVersionFromScript(): string | undefined {
  const versionPattern = /gen_dashboard_([a-f0-9]{40})\.js/;
  const script = document.querySelector("script[src^=\"/jsc/gen_dashboard_\"]");
  if (script) {
    const src = script.getAttribute("src") || "";
    const match = versionPattern.exec(src);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function getStoredVersion(): string | undefined {
  try {
    const version = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (version && /^[a-f0-9]{40}$/.test(version)) {
      return version;
    }
  } catch {
    // Browser storage may be unavailable during early page transitions.
  }

  return undefined;
}

function storeVersion(version: string): void {
  try {
    window.localStorage.setItem(VERSION_STORAGE_KEY, version);
  } catch {
    // Best-effort cache only; requests still use the in-memory version.
  }
}
