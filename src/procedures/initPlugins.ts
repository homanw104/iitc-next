/**
 * Define procedures for loading plugins.
 */

import type { AppContext } from "../app.ts";
import { logManager } from "../managers/system/logManager.ts";
import { pluginManager } from "../managers/system/pluginManager";

const LOG_TAG = "InitPlugins";

export default function initPlugins(appContext: AppContext): void {
  pluginManager.initEnabledPlugins();

  if (appContext.coreManagers) {
    appContext.coreManagers.layerManager.finalizePluginFilterRegistration();
  } else {
    logManager.error(LOG_TAG, "App context doesn't have core managers");
  }
}
