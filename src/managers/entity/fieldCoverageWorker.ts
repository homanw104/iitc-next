/**
 * Creates a data-URL worker for field coverage preprocessing in a userscript realm.
 */

import polygonClippingSource from "polygon-clipping/dist/polygon-clipping.umd.min.js?raw";
import { runFieldCoverageWorker } from "./fieldCoverageWorkerRuntime";

// Vite's Blob-based inline worker does not start reliably from the userscript realm.
const fieldCoverageWorkerSource = `${polygonClippingSource}
(${runFieldCoverageWorker.toString()})();`;
const fieldCoverageWorkerUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(fieldCoverageWorkerSource)}`;

export function createFieldCoverageWorker(): Worker {
  return new Worker(fieldCoverageWorkerUrl);
}
