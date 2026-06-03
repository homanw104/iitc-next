/**
 * Sample plugin for IITC Next
 *
 * This plugin will print a message to the console every 5 seconds.
 * unsafeWindow is provided by vite-plugin-monkey for access to the IITC Next core components.
 */

import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { unsafeWindow } from "vite-plugin-monkey/dist/client";

class SamplePlugin {
  public id = "sample-plugin";
  public name = "Sample Plugin";
  public description = "Print a message to the console every 5 seconds.";

  private viewer: IITCCore["viewer"];
  private logManager: IITCCore["logManager"];

  private interval: number | undefined;

  public init() {
    this.viewer = unsafeWindow.iitc.viewer!;
    this.logManager = unsafeWindow.iitc.logManager!;

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
  if (unsafeWindow.iitc && unsafeWindow.iitc.pluginManager) {
    unsafeWindow.iitc.pluginManager.registerPlugin(new SamplePlugin());
  } else {
    setTimeout(register, 3000);
  }
};

register();
