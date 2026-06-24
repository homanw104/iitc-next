/**
 * Creates and displays the startup splash controller.
 */

import type { AppContext } from "../app.ts";
import { SplashScreenController } from "../controllers/SplashScreenController.tsx";

export default function loadSplashScreen(appContext: AppContext): void {
  const splashController = new SplashScreenController(document.body);
  appContext.splashController = splashController;
  splashController.init();
}
