/**
 * Creates and displays the login screen.
 */

import LoginScreen from "../components/login/LoginScreen.tsx";
import { logManager } from "../managers/system/logManager.ts";
import { AppContext } from "../app.ts";

const LOG_TAG = "LoginScreen";

export default function loadLoginScreen(appContext: AppContext): void {
  logManager.debug(LOG_TAG, "Loading");

  if (appContext.splashScreenController) appContext.splashScreenController.deinit();
  document.body = document.createElement("body");
  document.body.appendChild(LoginScreen());
}
