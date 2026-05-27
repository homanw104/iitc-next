import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "world.homans.iitcnext",
  appName: "IITC Next",
  webDir: "dist",
  server: {
    url: "https://intel.ingress.com",
    cleartext: true
  }
};

export default config;
