/**
 * The vite configuration for IITC Next.
 */

import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string,
  dependencies: Record<string, string>,
};

const cesiumVersion = packageJson.dependencies.cesium.replace(/^[~^]/, "");
const cesiumBaseUrl = `https://cdn.jsdelivr.net/npm/cesium@${cesiumVersion}/Build/Cesium/`;
const cesiumWidgetsCssUrl = `${cesiumBaseUrl}Widgets/widgets.css`;
const cesiumWidgetsCssImport = "cesium/Build/Cesium/Widgets/widgets.css";

export default defineConfig({
  define: {
    __IITC_NEXT_VERSION__: JSON.stringify(packageJson.version),
    __CESIUM_BASE_URL__: JSON.stringify(cesiumBaseUrl),
  },
  plugins: [
    monkey({
      entry: "src/app.ts",
      userscript: {
        name: "iitc-next",
        author: "Homan",
        version: packageJson.version,
        description: "IITC Next",
        namespace: "npm/vite-plugin-monkey",
        match: ["https://intel.ingress.com/*"],
        exclude: [
          "https://intel.ingress.com/signinhandler*",
        ],
        "run-at": "document-start",
      },
      build: {
        externalGlobals: {
          cesium: cdn.jsdelivr("Cesium", "Build/Cesium/Cesium.js"),
        },
        externalResource: {
          [cesiumWidgetsCssImport]: {
            resourceName: "cesiumWidgets",
            resourceUrl: cesiumWidgetsCssUrl,
          },
        },
      },
    }),
  ],
  build: {
    emptyOutDir: false,
  }
});
