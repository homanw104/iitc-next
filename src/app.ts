/**
 * Entry point of the application.
 */

import type { SplashScreenController } from "./controllers/SplashScreenController.tsx";
import type { CoreManagers } from "./core/coreManagers.ts";
import checkAndMarkBootStatus from "./procedures/checkAndMarkBootStatus.ts";
import extractVersionString from "./procedures/extractVersionString";
import getPageRoute from "./procedures/getPageRoute.ts";
import getLoginStatus from "./procedures/getLoginStatus.ts";
import setUpResponsivePage from "./procedures/setUpResponsivePage.ts";
import disableStyleSheets from "./procedures/disableStyleSheets.ts";
import enableStyleSheets from "./procedures/enableStyleSheets.ts";
import patchCesiumModelPicking from "./procedures/patchCesiumModelPicking.ts";
import loadLoginScreen from "./procedures/loadLoginScreen.ts";
import loadSplashScreen from "./procedures/loadSplashScreen.ts";
import loadCesiumScript from "./procedures/loadCesiumScript.ts";
import setUpLogManager from "./procedures/setUpLogManager";
import setUpPlayerInfoManager from "./procedures/setUpPlayerInfoManager.ts";
import setUpSettingsManager from "./procedures/setUpSettingsManager.ts";
import startIITCNextRuntime from "./procedures/startIITCNextRuntime.ts";
import { safeLocalStorage } from "./utils/storage";
import { safeWindow } from "./utils/window";

export interface AppContext {
  coreManagers: CoreManagers | undefined;
  cesiumLoadPromise: Promise<void> | undefined;
  splashScreenController: SplashScreenController | undefined;
  styleSheets: NodeListOf<HTMLLinkElement> | undefined;
}

const appContext: AppContext = {
  coreManagers: undefined,
  cesiumLoadPromise: undefined,
  splashScreenController: undefined,
  styleSheets: undefined,
};

const init = async () => {
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
    patchCesiumModelPicking();
    await loadCesiumScript(appContext);
    await startIITCNextRuntime(appContext);
  }
};

// To know whether the script has booted
const isFirstBoot = checkAndMarkBootStatus();

// To know on which page we are
const pageRoute = getPageRoute();

if (isFirstBoot && pageRoute && pageRoute !== "/signinhandler") {
  // Set up a viewport meta tag for responsive design
  setUpResponsivePage();

  // Disable stylesheets that make the login page a desktop view
  disableStyleSheets(appContext);

  // Set up splash screen at the early stage
  loadSplashScreen(appContext);

  // Initialize once the DOM content is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().then(), { once: true });
  } else {
    init().then();
  }
}
