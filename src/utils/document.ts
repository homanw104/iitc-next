/**
 * Utility to extract parameters from the stock Intel site.
 */

/**
 * Solely extracts the version from the gen_dashboard script filename.
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
