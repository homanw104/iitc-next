/**
 * Define procedures for loading plugins.
 */

import { AppContext } from "../app.ts";
import { pluginManager } from "../managers/system/pluginManager";
import { logManager } from "../managers/system/logManager.ts";

const LOG_TAG = "InitPlugins";

export default function initPlugins(appContext: AppContext): void {
  pluginManager.initEnabledPlugins();

  if (appContext.coreManagers) {
    appContext.coreManagers.layerManager.finalizePluginFilterRegistration();
  } else {
    logManager.error(LOG_TAG, "App context doesn't have core managers");
  }
}
