import { unsafeWindow } from "vite-plugin-monkey/dist/client";

/**
 * Returns the most appropriate global window object.
 * In Userscript environments, this is unsafeWindow.
 * In standard browser environments, it's window.
 */
export const getWindow = (): Window => {
  if (typeof unsafeWindow !== "undefined") {
    return unsafeWindow;
  }
  return window;
};

export const safeWindow = getWindow();
