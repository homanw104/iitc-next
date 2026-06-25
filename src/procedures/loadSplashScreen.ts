/**
 * Creates and displays the startup splash controller.
 */

import type { AppContext } from "../app.ts";
import { SplashScreenController } from "../controllers/SplashScreenController.tsx";

export default function loadSplashScreen(appContext: AppContext): void {
  if (appContext.splashScreenController) return;

  const container = document.documentElement;
  appContext.splashScreenController = new SplashScreenController(container);
  appContext.splashScreenController.init();
}
