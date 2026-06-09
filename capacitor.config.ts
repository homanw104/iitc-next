/**
 * Config for build with capacitor android.
 */

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
      "nianticlabs.com",
      "*.nianticlabs.com",
      "iitc-next.local"
    ]
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    CapacitorCookies: {
      enabled: true
    }
  }
};

export default config;
