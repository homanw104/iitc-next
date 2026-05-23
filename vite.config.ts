import { defineConfig } from "vite/dist/node";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/app.ts",
      userscript: {
        name: "iitc-next",
        namespace: "npm/vite-plugin-monkey",
        match: ["https://intel.ingress.com/*"],
      },
    }),
  ],
});
