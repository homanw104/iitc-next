/**
 * Claims the page-level IITC Next boot slot to prevent
 * multiple IITC instances from running on the same page.
 */

import { safeWindow } from "../utils/window";

type WindowWithBootState = Window & typeof globalThis & {
  iitcNextBooted?: boolean;
};

export default function checkAndMarkBootStatus(): boolean {
  const targetWindow = safeWindow as WindowWithBootState;
  if (targetWindow.iitcNextBooted) return false;
  targetWindow.iitcNextBooted = true;
  return true;
}
