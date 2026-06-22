/**
 * Define procedures for loading plugins.
 */

import { AppContext } from "../app.ts";
import { pluginManager } from "../managers/pluginManager";
import { logManager } from "../managers/logManager.ts";

export default function initPlugins(appContext: AppContext): void {
  pluginManager.initEnabledPlugins();

  if (appContext.coreManagers) {
    appContext.coreManagers.layerManager.finalizePluginFilterRegistration();
  } else {
    logManager.error("InitPlugins", "App context doesn't have core managers");
  }
}
