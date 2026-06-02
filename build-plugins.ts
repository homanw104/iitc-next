/**
 * This script is a runner that automates the building of multiple independent IITC plugins.
 * 
 * Since vite-plugin-monkey typically supports only one userscript per build,
 * this script iterates through an array of configurations (provided by vite.plugin.config.ts)
 * and triggers a separate Vite build for each one.
 */
import { build } from "vite";
import configs from "./vite.plugin.config";

async function buildAll() {
  for (const config of configs) {
    const plugins = config.plugins ? (Array.isArray(config.plugins) ? config.plugins.flat() : [config.plugins]) : [];
    const pluginName = (plugins.find(p => p && typeof p === "object" && "name" in p) as any)?.name || "unknown";
    
    console.log(`Building plugin: ${pluginName}...`);
    
    // Execute the Vite build for this specific plugin configuration
    await build(config);
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
