/**
 * Disable all stylesheets and saved to app context for later use.
 */

import { AppContext } from "../app.ts";

export default function disableStyleSheets(appContext: AppContext) {
  appContext.styleSheetCache = document.querySelectorAll<HTMLLinkElement>("head link[rel~='stylesheet']");
  appContext.styleSheetCache.forEach(sheet => sheet.remove());
}
