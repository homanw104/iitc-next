/**
 * Hides the startup splash once the initial scene is ready.
 */

import { AppContext } from "../app.ts";
import { logManager } from "../managers/logManager.ts";

export default function scheduleUnloadSplashScreen(appContext: AppContext): void {
  if (appContext.coreManagers) {
    appContext.coreManagers.sceneEventManager.waitForInitSceneLoaded()
      .then(() => {
        if (appContext.splashController) {
          appContext.splashController.deinit();
        } else {
          logManager.error("ScheduleUnloadSplash", "App context has no splash controller");
        }
      });
  } else {
    logManager.error("ScheduleUnloadSplash", "App context doesn't have core managers");
  }
}
