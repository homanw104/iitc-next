/**
 * This script is a runner that automates the building of multiple independent IITC plugins.
 *
 * Since vite-plugin-monkey typically supports only one userscript per build,
 * this script iterates through the folder-based plugin configurations provided by
 * vite.plugin.config.ts and triggers a separate Vite build for each one.
 */
import { rmSync } from "fs";
import { build } from "vite";
import configs from "../vite.plugin.config";

async function buildAll() {
  rmSync("dist/plugins", { recursive: true, force: true });

  for (const { name, config } of configs) {
    console.log(`Building plugin: ${name}...`);

    // Execute the Vite build for this specific plugin configuration.
    await build(config);
  }
}

buildAll().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
