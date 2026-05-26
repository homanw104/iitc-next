import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/app.ts",
      userscript: {
        name: "iitc-next",
        author: "Homan",
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
          "cesium/Build/Cesium/Widgets/widgets.css": "https://cdn.jsdelivr.net/npm/cesium@1.141.0/Build/Cesium/Widgets/widgets.css",
        },
      },
    }),
  ],
});
