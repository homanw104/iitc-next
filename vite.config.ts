import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/app.ts",
      userscript: {
        name: "iitc-next",
        namespace: "npm/vite-plugin-monkey",
        match: ["https://intel.ingress.com/*"],
      },
      build: {
        externalGlobals: {
          cesium: cdn.jsdelivr("Cesium", "Build/Cesium/Cesium.js"),
        },
        externalResource: {
          "cesium/Build/Cesium/Widgets/widgets.css": cdn.jsdelivr(
            "Build/Cesium/Widgets/widgets.css"
          ),
        },
      },
    }),
  ],
});
