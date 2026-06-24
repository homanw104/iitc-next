/**
 * Load CesiumViewer into the document and create core managers.
 */

import type { AppContext } from "../app.ts";
import { configureCameraControls } from "../cesium/setup/configureCameraControls.ts";
import { createCesiumContainer } from "../cesium/setup/createCesiumContainer";
import { initCesiumViewer } from "../cesium/setup/initCesiumViewer";
import { restoreLastView } from "../cesium/setup/restoreLastView.ts";
import { setUpEntityPositionRefresh } from "../cesium/setup/setUpEntityPositionRefresh.ts";
import { setUpInteractionHandlers } from "../cesium/setup/setUpInteractionHandlers.ts";
import { setUpTileUpdateWhenMove } from "../cesium/setup/setUpTileUpdateWhenMove.ts";
import { mountCoreControllersAndUI } from "../core/coreControllers.ts";
import { createCoreManagers, exposeCoreManagers } from "../core/coreManagers";
import { logManager } from "../managers/system/logManager";
import { safeWindow } from "../utils/window";

const LOG_TAG = "LoadCesiumViewer";

export default function loadCesiumViewer(appContext: AppContext): void {
  logManager.debug(LOG_TAG, "Loading");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  restoreLastView(viewer);

  const managers = createCoreManagers(viewer, container);
  const entityPositionManager = managers.entityPositionManager;
  const portalEntityManager = managers.portalEntityManager;
  const portalLabelEntityManager = managers.portalLabelEntityManager;
  const portalOrnamentEntityManager = managers.portalOrnamentEntityManager;
  const portalHistoryEntityManager = managers.portalHistoryEntityManager;
  const scoutHistoryEntityManager = managers.scoutHistoryEntityManager;
  const tileRequestManager = managers.tileRequestManager;

  // Expose managers to the global iitc object
  if (safeWindow) exposeCoreManagers(safeWindow.iitc, viewer, managers);

  // Mount core UI and get portal details UI and portal data in state
  const { portalDetailPaneController, state } = mountCoreControllersAndUI(viewer, container, managers);

  configureCameraControls(viewer);
  setUpInteractionHandlers(viewer, container, portalDetailPaneController, portalEntityManager, portalLabelEntityManager, portalOrnamentEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, state);
  setUpEntityPositionRefresh(viewer, entityPositionManager);
  setUpTileUpdateWhenMove(viewer, tileRequestManager);

  appContext.coreManagers = managers;
}
