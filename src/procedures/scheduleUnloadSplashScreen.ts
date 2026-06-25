/**
 * Hides the startup splash once the initial scene is ready.
 */

import type { AppContext } from "../app.ts";
import { logManager } from "../managers/system/logManager.ts";

const LOG_TAG = "ScheduleUnloadSplashScreen";

export default function scheduleUnloadSplashScreen(appContext: AppContext): void {
  if (appContext.coreManagers) {
    appContext.coreManagers.sceneEventManager.waitForInitSceneLoaded()
      .then(() => {
        if (appContext.splashScreenController) {
          appContext.splashScreenController.deinit();
        } else {
          logManager.error(LOG_TAG, "App context has no splash controller");
        }
      });
  } else {
    logManager.error(LOG_TAG, "App context doesn't have core managers");
  }
}
