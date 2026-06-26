/**
 * Loads the Cesium global script outside Tampermonkey @require.
 */

import { safeWindow } from "../utils/window";
import type { AppContext } from "../app";

const CESIUM_SCRIPT_ID = "iitc-next-cesium-script";

type WindowWithCesium = Window & typeof globalThis & {
  Cesium?: typeof import("cesium");
};

export default function loadCesiumScript(appContext: AppContext): Promise<void> {
  const targetWindow = safeWindow as WindowWithCesium;
  if (targetWindow.Cesium) return Promise.resolve();
  if (appContext.cesiumLoadPromise) return appContext.cesiumLoadPromise;

  appContext.cesiumLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(CESIUM_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Cesium")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = CESIUM_SCRIPT_ID;
    script.src = `${__CESIUM_BASE_URL__}Cesium.js`;
    script.async = true;
    script.addEventListener("load", () => {
      if (targetWindow.Cesium) resolve();
      else reject(new Error("Cesium loaded without creating window.Cesium"));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load Cesium")), { once: true });

    document.head.appendChild(script);
  });

  return appContext.cesiumLoadPromise;
}
