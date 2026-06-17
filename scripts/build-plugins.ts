/**
 * This script is a runner that automates the building of multiple independent IITC plugins.
 *
 * Since vite-plugin-monkey typically supports only one userscript per build,
 * this script iterates through an array of configurations (provided by vite.plugin.config.ts)
 * and triggers a separate Vite build for each one.
 */
import { build, type PluginOption } from "vite";
import configs from "../vite.plugin.config";

function hasPluginName(plugin: unknown): plugin is { name: string } {
  return (
    typeof plugin === "object" &&
    plugin !== null &&
    "name" in plugin &&
    typeof (plugin as { name?: unknown }).name === "string"
  );
}

function getPluginName(plugins: PluginOption | PluginOption[] | undefined): string {
  const pluginList = plugins ? (Array.isArray(plugins) ? [...plugins] : [plugins]) : [];

  for (const plugin of pluginList) {
    if (Array.isArray(plugin)) {
      pluginList.push(...plugin);
    } else if (hasPluginName(plugin)) {
      return plugin.name;
    }
  }

  return "unknown";
}

async function buildAll() {
  for (const config of configs) {
    const pluginName = getPluginName(config.plugins);

    console.log(`Building plugin: ${pluginName}...`);

    // Execute the Vite build for this specific plugin configuration.
    await build(config);
  }
}

buildAll().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
