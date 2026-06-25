/**
 * Disable all stylesheets and saved to app context for later use.
 */

import { AppContext } from "../app.ts";

export default function disableStyleSheets(appContext: AppContext) {
  appContext.styleSheets = document.querySelectorAll<HTMLLinkElement>("head link[rel~='stylesheet']");
  appContext.styleSheets.forEach(sheet => sheet.remove());
}
