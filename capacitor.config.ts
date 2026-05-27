import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "world.homans.iitcnext",
  appName: "IITC Next",
  webDir: "dist",
  server: {
    url: "https://intel.ingress.com",
    cleartext: true,
    allowNavigation: [
      "intel.ingress.com",
      "*.ingress.com",
      "google.com",
      "*.google.com",
      "*.googleusercontent.com",
      "*.gstatic.com",
      "*.googleapis.com",
      "nianticspatial.com",
      "*.nianticspatial.com",
      "iitc-next.local"
    ]
  },
  android: {
    overrideUserAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    allowMixedContent: true
  },
  plugins: {
    CapacitorCookies: {
      enabled: true
    }
  }
};

export default config;
