/**
 * Vite Configuration for IITC Plugins
 * 
 * This file automatically discovers all TypeScript files in `src/plugins`
 * and generates a separate Vite configuration for each one.
 * 
 * This allows each plugin to be built into its own `.user.js` file
 * with independent metadata and dependencies.
 */

import { readdirSync } from "fs";
import { join, parse } from "path";
import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

const pluginDir = "src/plugins";
const files = readdirSync(pluginDir);

export default files
  .filter((file) => file.endsWith(".ts"))
  .map((file) => {
    const { name } = parse(file);
    return defineConfig({
      plugins: [
        monkey({
          // The source file for this plugin
          entry: join(pluginDir, file),
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
    });
  });
