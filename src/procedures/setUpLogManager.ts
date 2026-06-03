/**
 * Simply sets up the global log manager.
 */

import { unsafeWindow } from "vite-plugin-monkey/dist/client";
import { logManager } from "../managers/logManager";

export default function setUpLogManager(): void {
  logManager.setLevel("DEBUG");
  unsafeWindow.iitc.logManager = logManager;
}
