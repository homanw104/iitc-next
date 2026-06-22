/**
 * Entry point of the application.
 */

import { CoreManagers } from "./core/coreManagers.ts";
import { SplashScreenController } from "./controllers/SplashScreenController.tsx";
import { safeWindow } from "./utils/window";
import { safeLocalStorage } from "./utils/storage";
import setUpLogManager from "./procedures/setUpLogManager";
import loadSplashScreen from "./procedures/loadSplashScreen.ts";
import extractVersionString from "./procedures/extractVersionString";
import setUpSettingsManager from "./procedures/setUpSettingsManager.ts";
import setUpPlayerInfoManager from "./procedures/setUpPlayerInfoManager.ts";
import getLoginStatus from "./procedures/getLoginStatus.ts";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import registerPlugins from "./procedures/registerPlugins";
import initPlugins from "./procedures/initPlugins";
import scheduleUnloadSplashScreen from "./procedures/scheduleUnloadSplashScreen.ts";

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
