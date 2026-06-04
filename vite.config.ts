/**
 * The vite configuration for IITC Next.
 */

import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/app.ts",
      userscript: {
        name: "iitc-next",
        author: "Homan",
        version: "1.0.2",
        description: "IITC Next",
        namespace: "npm/vite-plugin-monkey",
        match: ["https://intel.ingress.com/*"],
        "run-at": "document-end",
      },
      build: {
        externalGlobals: {
          cesium: cdn.jsdelivr("Cesium", "Build/Cesium/Cesium.js"),
        },
        externalResource: {
          "cesium/Build/Cesium/Widgets/widgets.css": [
            "cesium/Build/Cesium/Widgets/widgets.css",
            (version) =>
              `https://cdn.jsdelivr.net/npm/cesium@${version}/Build/Cesium/Widgets/widgets.css`,
          ],
        },
      },
    }),
  ],
  build: {
    emptyOutDir: false,
  }
});
