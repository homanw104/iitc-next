/**
 * Sample plugin for IITC Next
 *
 * This plugin will print a message to the console every 5 seconds.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";

class SamplePlugin {
  public id = "sample-plugin";
  public name = "Sample Plugin";
  public description = "Print a message to the console every 5 seconds.";

  private viewer: IITCCore["viewer"];
  private logManager: IITCCore["logManager"];

  private interval: number | undefined;

  public init() {
    if (safeWindow) {
      const iitc = (safeWindow as any).iitc;
      this.viewer = iitc.viewer!;
      this.logManager = iitc.logManager!;
    }

    if (!this.viewer || !this.logManager) {
      console.log("[SamplePlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager
      });
      return;
    }

    this.interval = setInterval(() => {
      this.logManager!.info("SamplePlugin", "Sample plugin loaded");
    }, 5000);
  }

  public deinit() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

const register = () => {
  if (safeWindow && (safeWindow as any).iitc && (safeWindow as any).iitc.pluginManager) {
    (safeWindow as any).iitc.pluginManager.registerPlugin(new SamplePlugin());
  } else {
    setTimeout(register, 3000);
  }
};

register();
