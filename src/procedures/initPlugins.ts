/**
 * Define procedures for loading plugins.
 */

import { pluginManager } from "../managers/pluginManager";
import type { LayerManager } from "../managers/layerManager";

export default function initPlugins(layerManager: LayerManager): void {
  pluginManager.initEnabledPlugins();
  layerManager.finalizePluginFilterRegistration();
}
