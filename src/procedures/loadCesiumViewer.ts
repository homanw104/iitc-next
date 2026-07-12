/**
 * Load CesiumViewer into the document and create core managers.
 */

import type { AppContext } from "../app.ts";
import { configureCameraControls } from "../cesium/setup/configureCameraControls.ts";
import { createCesiumContainer } from "../cesium/setup/createCesiumContainer";
import { createCesiumViewer } from "../cesium/setup/createCesiumViewer.ts";
import { createBaseLayerViewModels } from "../cesium/setup/createBaseLayersViewModels.ts";
import { keepRestoredCameraAboveTerrain } from "../cesium/setup/keepRestoredCameraAboveTerrain.ts";
import { restoreLastView } from "../cesium/setup/restoreLastView.ts";
import { restoreBaseLayer } from "../cesium/setup/restoreBaseLayer.ts";
import { moveCreditWidget } from "../cesium/setup/moveCreditWidget.ts";
import { setUpEntityTerrainRefresh } from "../cesium/setup/setUpEntityTerrainRefresh.ts";
import { setUpInteractionHandlers } from "../cesium/setup/setUpInteractionHandlers.ts";
import { setUpTileUpdateWhenMove } from "../cesium/setup/setUpTileUpdateWhenMove.ts";
import { setUpDebugTilesRefresh } from "../cesium/setup/setUpDebugTilesRefresh.ts";
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
  const restoredPosition = restoreLastView(viewer);

  restoreBaseLayer(viewer);
  moveCreditWidget(container);

  const managers = createCoreManagers(viewer, container);
  const entityPositionManager = managers.entityPositionManager;
  const entityTranslucencyManager = managers.entityTranslucencyManager;
  const portalManager = managers.portalManager;
  const portalLabelManager = managers.portalLabelManager;
  const portalOrnamentManager = managers.portalOrnamentManager;
  const portalHistoryManager = managers.portalHistoryManager;
  const scoutHistoryManager = managers.scoutHistoryManager;
  const tileRequestManager = managers.tileRequestManager;
  const debugTileManager = managers.debugTileManager;
  const loadingProgressManager = managers.loadingProgressManager;

  // Expose managers to the global iitc object
  if (safeWindow) exposeCoreManagers(safeWindow.iitc, viewer, managers);

  // Mount core UI and get portal details UI and portal data in state
  const { portalDetailPaneController, portalDetailState } = mountCoreControllersAndUI(viewer, container, managers);

  configureCameraControls(viewer);
  keepRestoredCameraAboveTerrain(viewer, entityPositionManager, restoredPosition);
  setUpDebugTilesRefresh(tileRequestManager, debugTileManager);
  setUpEntityTerrainRefresh(viewer, entityPositionManager, entityTranslucencyManager, loadingProgressManager);
  setUpInteractionHandlers(viewer, container, portalDetailPaneController, portalManager, portalLabelManager, portalOrnamentManager, portalHistoryManager, scoutHistoryManager, portalDetailState);
  setUpTileUpdateWhenMove(viewer, tileRequestManager);

  appContext.coreManagers = managers;
}
