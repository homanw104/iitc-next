/**
 * Entry point of the application.
 */

import type { SplashScreenController } from "./controllers/SplashScreenController.tsx";
import type { CoreManagers } from "./core/coreManagers.ts";
import extractVersionString from "./procedures/extractVersionString";
import getLoginStatus from "./procedures/getLoginStatus.ts";
import initPlugins from "./procedures/initPlugins";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import loadSplashScreen from "./procedures/loadSplashScreen.ts";
import registerPlugins from "./procedures/registerPlugins";
import scheduleUnloadSplashScreen from "./procedures/scheduleUnloadSplashScreen.ts";
import setUpLogManager from "./procedures/setUpLogManager";
import setUpPlayerInfoManager from "./procedures/setUpPlayerInfoManager.ts";
import setUpSettingsManager from "./procedures/setUpSettingsManager.ts";
import { safeLocalStorage } from "./utils/storage";
import { safeWindow } from "./utils/window";

export interface AppContext {
  initStarted: boolean;
  splashController: SplashScreenController | undefined;
  coreManagers: CoreManagers | undefined;
}

const appContext: AppContext = {
  initStarted: false,
  splashController: undefined,
  coreManagers: undefined,
};

const init = async () => {
  if (appContext.initStarted) return;
  appContext.initStarted = true;

  await safeLocalStorage.initialize();
  safeLocalStorage.shadow();
  safeWindow.iitc = {};

  setUpLogManager();
  extractVersionString();
  setUpSettingsManager();
  setUpPlayerInfoManager();

  if (!getLoginStatus()) {
    return;   // Load login screen
  } else {
    loadCesiumViewer(appContext);
    loadSplashScreen(appContext);
    await registerPlugins();
    initPlugins(appContext);
    scheduleUnloadSplashScreen(appContext);
  }
};

// Disable vanilla JS
window.onload = function () {};
document.body.onload = function () {};

// Initialize once the DOM content is loaded
if (document.readyState === "complete") {
  init().then();
} else {
  window.addEventListener("load", init);
}
