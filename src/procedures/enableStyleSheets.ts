/**
 * Re-enable all stylesheets that were disabled in disableStyleSheets.
 */

import { AppContext } from "../app.ts";

export default function enableStyleSheets(appContext: AppContext) {
  if (appContext.styleSheetCache) appContext.styleSheetCache.forEach(sheet => document.head.appendChild(sheet));
}
