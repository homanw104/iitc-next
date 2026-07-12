/**
 * Vite Configuration for IITC Plugins
 * 
 * This file automatically discovers `src/plugins/<name>/plugin.ts` entry points
 * and generates a separate Vite configuration for each plugin folder.
 * 
 * This allows each plugin to be built into its own `.user.js` file
 * with independent metadata and dependencies.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

const pluginsDir = "src/plugins";
const pluginDirectories = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(pluginsDir, entry.name, "plugin.ts")));

export default pluginDirectories
  .map((directory) => {
    const name = directory.name;
    return {
      name,
      config: defineConfig({
        plugins: [
          monkey({
            // The source file for this plugin
            entry: join(pluginsDir, name, "plugin.ts"),
            userscript: {
              name: `iitc-next-plugin-${name}`,
              author: "Homan",
              description: `IITC Next Plugin: ${name}`,
              namespace: "npm/vite-plugin-monkey",
              match: ["https://intel.ingress.com/*"],
              "run-at": "document-end",
            },
            build: {
              // Output filename for the userscript
              fileName: `${name}.user.js`,
              externalGlobals: {
                // Load Cesium from CDN to keep the script size small
                cesium: cdn.jsdelivr("Cesium", "Build/Cesium/Cesium.js"),
              },
            },
          }),
        ],
        build: {
          // All plugins are deposited into dist/plugins
          outDir: "dist/plugins",
          // Do not empty outDir on every build since we are running multiple builds sequentially
          emptyOutDir: false,
        },
      }),
    };
  });
