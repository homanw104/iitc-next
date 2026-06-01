import { defineConfig } from "vite";
import monkey, { cdn } from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/plugins/playerActivity.ts",
      userscript: {
        name: "iitc-next-player-activity",
        author: "Homan",
        description: "IITC Next Plugin: Player Activity Tracker",
        namespace: "npm/vite-plugin-monkey",
        match: ["https://intel.ingress.com/*"],
        "run-at": "document-end",
      },
      build: {
        externalGlobals: {
          cesium: cdn.jsdelivr("Cesium", "Build/Cesium/Cesium.js"),
        },
      },
    }),
  ],
});
