/**
 * Sample plugin for IITC Next
 *
 * This plugin will print a message to the console every 5 seconds.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";

const LOG_TAG = "SamplePlugin";

class SamplePlugin {
  public id = "sample-plugin";
  public name = "Sample Plugin";
  public description = "Print a message to the console every 5 seconds.";

  // Register the managers you need here
  private viewer!: NonNullable<IITCCore["viewer"]>;
  private logManager!: NonNullable<IITCCore["logManager"]>;

  // Your variables are set here
  private interval: number | undefined;

  public init() {
    // Call in the managers here
    const iitc = safeWindow.iitc;
    this.viewer = iitc.viewer!;
    this.logManager = iitc.logManager!;

    // Check for the core components here
    if (!this.viewer || !this.logManager) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
      });
      return;
    }

    // Your code runs here
    try {
      this.logEveryFiveSeconds();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize sample plugin", e);
    }
  }

  public deinit() {
    // Remember to clean up when deinitializing
    try {
      if (this.interval) {
        window.clearInterval(this.interval);
        this.interval = undefined;
      }
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize sample plugin", e);
    }
  }

  private logEveryFiveSeconds() {
    this.interval = window.setInterval(() => {
      this.logManager!.info("SamplePlugin", "Sample plugin loaded");
    }, 5000);
  }
}

// Register yourself to IITC Next
const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new SamplePlugin());
  } else {
    window.setTimeout(register, 1000);
  }
};

register();
