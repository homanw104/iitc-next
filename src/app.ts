/**
 * Entry point of the application.
 */

import type { SplashScreenController } from "./controllers/SplashScreenController.tsx";
import type { CoreManagers } from "./core/coreManagers.ts";
import extractVersionString from "./procedures/extractVersionString";
import getPageRoute from "./procedures/getPageRoute.ts";
import getLoginStatus from "./procedures/getLoginStatus.ts";
import setUpResponsivePage from "./procedures/setUpResponsivePage.ts";
import disableStyleSheets from "./procedures/disableStyleSheets.ts";
import enableStyleSheets from "./procedures/enableStyleSheets.ts";
import initPlugins from "./procedures/initPlugins";
import loadCesiumViewer from "./procedures/loadCesiumViewer";
import loadLoginScreen from "./procedures/loadLoginScreen.ts";
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
  coreManagers: CoreManagers | undefined;
  splashScreenController: SplashScreenController | undefined;
  styleSheets: NodeListOf<HTMLLinkElement> | undefined;
}

const appContext: AppContext = {
  initStarted: false,
  coreManagers: undefined,
  splashScreenController: undefined,
  styleSheets: undefined,
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
    loadLoginScreen(appContext);
  } else {
    enableStyleSheets(appContext);
    loadCesiumViewer(appContext);
    await registerPlugins();
    initPlugins(appContext);
    scheduleUnloadSplashScreen(appContext);
  }
};

// To know on which page we are
const pageRoute = getPageRoute();

if (pageRoute && pageRoute !== "/signinhandler") {
  // Set up splash screen at the very start
  setUpResponsivePage();
  disableStyleSheets(appContext);
  loadSplashScreen(appContext);

  // Disable vanilla JS
  window.onload = function () {};
  if (document.body) document.body.onload = function () {};

  // Initialize once the DOM content is loaded
  if (document.readyState === "complete") {
    init().then();
  } else {
    window.addEventListener("load", init);
  }
}
