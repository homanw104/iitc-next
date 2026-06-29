/**
 * Starts the Cesium-backed map runtime after the lightweight boot UI is visible.
 */

import type { AppContext } from "../app";

export default async function startIITCNextRuntime(appContext: AppContext): Promise<void> {
  // Keep these imports lazy. The modules below import the "cesium" alias, which
  // reads safeWindow.Cesium at module evaluation time; app.ts loads Cesium's UMD
  // bundle immediately before calling this function in loadCesiumScript()
  const { default: loadCesiumViewer } = await import("./loadCesiumViewer");
  const { default: registerPlugins } = await import("./registerPlugins");
  const { default: initPlugins } = await import("./initPlugins");
  const { default: scheduleUnloadSplashScreen } = await import("./scheduleUnloadSplashScreen");

  loadCesiumViewer(appContext);
  await registerPlugins();
  initPlugins(appContext);
  scheduleUnloadSplashScreen(appContext);
}
