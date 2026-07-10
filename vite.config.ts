/**
 * The vite configuration for IITC Next.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import cesiumGlobalBridge from "./vite/cesiumGlobalBridge.ts";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string,
  dependencies: Record<string, string>,
};

const cesiumVersion = packageJson.dependencies.cesium.replace(/^[~^]/, "");
const cesiumBaseUrl = `https://cdn.jsdelivr.net/npm/cesium@${cesiumVersion}/Build/Cesium/`;
const cesiumWidgetsCssUrl = `${cesiumBaseUrl}Widgets/widgets.css`;
const cesiumWidgetsCssImport = "cesium/Build/Cesium/Widgets/widgets.css";
const cesiumGlobalBridgePath = fileURLToPath(new URL("./src/cesium/global/cesium.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^cesium$/,
        replacement: cesiumGlobalBridgePath,
      },
    ],
  },
  define: {
    __IITC_NEXT_VERSION__: JSON.stringify(packageJson.version),
    __CESIUM_BASE_URL__: JSON.stringify(cesiumBaseUrl),
  },
  plugins: [
    cesiumGlobalBridge(cesiumGlobalBridgePath),
    monkey({
      entry: "src/bootstrap.ts",
      userscript: {
        name: "IITC Next: Your next Ingress Intel Total Conversion script",
        author: "Homan",
        version: packageJson.version,
        description: "IITC Next",
        icon: "https://iitcnext.homans.world/favicon.ico",
        namespace: "https://github.com/homanw104/iitc-next",
        downloadURL: "https://github.com/homanw104/iitc-next/releases/latest/download/iitc-next.user.js",
        match: ["https://intel.ingress.com/*"],
        exclude: ["https://intel.ingress.com/signinhandler*"],
        connect: ["maps.googleapis.com", "*.googleapis.com", "*.google.com", "tm.amap.com"],
        "run-at": "document-start",
      },
      build: {
        systemjs: "inline",
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
