/**
 * Exposes the core managers to the IITC object for global access.
 */

import * as Cesium from "cesium";
import { IITCCore } from "../../types/iitc/iitc.ts";
import { CoreManagers } from "./createCoreManagers.ts";

export function exposeCoreManagers(iitc: IITCCore, viewer: Cesium.Viewer, managers: CoreManagers): void {
  iitc.viewer = viewer;
  iitc.layerManager = managers.layerManager;
  iitc.loadingProgressManager = managers.loadingProgressManager;
  iitc.entityPositionManager = managers.entityPositionManager;
  iitc.entityTranslucencyManager = managers.entityTranslucencyManager;
  iitc.portalManager = managers.portalManager;
  iitc.portalLabelManager = managers.portalLabelManager;
  iitc.portalOrnamentManager = managers.portalOrnamentManager;
  iitc.portalHistoryManager = managers.portalHistoryManager;
  iitc.scoutHistoryManager = managers.scoutHistoryManager;
  iitc.linkManager = managers.linkManager;
  iitc.fieldManager = managers.fieldManager;
  iitc.tileRequestManager = managers.tileRequestManager;
  iitc.commManager = managers.commManager;
  iitc.scoreManager = managers.scoreManager;
  iitc.redeemManager = managers.redeemManager;
  iitc.interfaceManager = managers.interfaceManager;
}
