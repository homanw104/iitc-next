/**
 * Load CesiumViewer into the document and create core managers.
 */

import type { AppContext } from "../app.ts";
import { configureCameraControls } from "../cesium/setup/configureCameraControls.ts";
import { createCesiumContainer } from "../cesium/setup/createCesiumContainer";
import { createCesiumViewer } from "../cesium/setup/createCesiumViewer.ts";
import { createBaseLayerViewModels } from "../cesium/setup/createBaseLayersViewModels.ts";
import { moveCreditElement } from "../cesium/setup/moveCreditElement.ts";
import { restoreLastView } from "../cesium/setup/restoreLastView.ts";
import { setUpEntityPositionRefresh } from "../cesium/setup/setUpEntityPositionRefresh.ts";
import { setUpInteractionHandlers } from "../cesium/setup/setUpInteractionHandlers.ts";
import { setUpTileUpdateWhenMove } from "../cesium/setup/setUpTileUpdateWhenMove.ts";
import { setupDebugTilesRefresh } from "../cesium/setup/setupDebugTilesRefresh.ts";
import { mountCoreControllersAndUI } from "../cesium/setup/mountCoreControllersAndUI.ts";
import { createCoreManagers } from "../cesium/setup/createCoreManagers.ts";
import { exposeCoreManagers } from "../cesium/setup/exposeCoreManagers.ts";
import { logManager } from "../managers/system/logManager";
import { safeWindow } from "../utils/window";

const LOG_TAG = "LoadCesiumViewer";

export default function loadCesiumViewer(appContext: AppContext): void {
  logManager.debug(LOG_TAG, "Loading");
  document.body = document.createElement("body");

  const container = createCesiumContainer();
  const viewModels = createBaseLayerViewModels();
  const viewer = createCesiumViewer(container, viewModels);

  moveCreditElement(container);
  restoreLastView(viewer);

  const managers = createCoreManagers(viewer, container);
  const entityPositionManager = managers.entityPositionManager;
  const portalEntityManager = managers.portalEntityManager;
  const portalLabelEntityManager = managers.portalLabelEntityManager;
  const portalOrnamentEntityManager = managers.portalOrnamentEntityManager;
  const portalHistoryEntityManager = managers.portalHistoryEntityManager;
  const scoutHistoryEntityManager = managers.scoutHistoryEntityManager;
  const tileRequestManager = managers.tileRequestManager;
  const debugTileEntityManager = managers.debugTileEntityManager;
  const loadingProgressManager = managers.loadingProgressManager;

  // Expose managers to the global iitc object
  if (safeWindow) exposeCoreManagers(safeWindow.iitc, viewer, managers);

  // Mount core UI and get portal details UI and portal data in state
  const { portalDetailPaneController, portalDetailState } = mountCoreControllersAndUI(viewer, container, managers);

  configureCameraControls(viewer);
  setupDebugTilesRefresh(tileRequestManager, debugTileEntityManager);
  setUpEntityPositionRefresh(viewer, entityPositionManager, loadingProgressManager);
  setUpInteractionHandlers(viewer, container, portalDetailPaneController, portalEntityManager, portalLabelEntityManager, portalOrnamentEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, portalDetailState);
  setUpTileUpdateWhenMove(viewer, tileRequestManager);

  appContext.coreManagers = managers;
}
