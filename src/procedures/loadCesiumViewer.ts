import { safeWindow } from "../utils/window";
import { logManager } from "../managers/logManager";
import { createCoreManagers, exposeCoreManagers } from "../core/coreManagers";
import { mountCoreControllersAndUI } from "../core/coreControllers.ts";
import { createCesiumContainer } from "../cesium/setup/createCesiumContainer";
import { initCesiumViewer } from "../cesium/setup/initCesiumViewer";
import { restoreLastView } from "../cesium/setup/restoreLastView.ts";
import { setUpTileUpdateWhenMove } from "../cesium/setup/setUpTileUpdateWhenMove.ts";
import { configureCameraControls } from "../cesium/setup/configureCameraControls.ts";
import { setUpInteractionHandlers } from "../cesium/setup/setUpInteractionHandlers.ts";
import { setUpClampedPortalRefresh } from "../cesium/setup/setUpClampedPortalRefresh.ts";

export default function loadCesiumViewer(): void {
  logManager.debug("CesiumViewer", "Loading");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  restoreLastView(viewer);

  const managers = createCoreManagers(viewer, container);
  const portalEntityManager = managers.portalEntityManager;
  const portalLabelEntityManager = managers.portalLabelEntityManager;
  const portalHistoryEntityManager = managers.portalHistoryEntityManager;
  const scoutHistoryEntityManager = managers.scoutHistoryEntityManager;
  const tileRequestManager = managers.tileRequestManager;

  // Expose managers to the global iitc object
  if (safeWindow) exposeCoreManagers(safeWindow.iitc, viewer, managers);

  // Mount core UI and get portal details UI and portal data in state
  const { portalDetailPaneController, state } = mountCoreControllersAndUI(viewer, container, managers);

  setUpInteractionHandlers(viewer, container, portalDetailPaneController, portalEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, state);
  setUpClampedPortalRefresh(viewer, portalEntityManager, portalLabelEntityManager, tileRequestManager);
  setUpTileUpdateWhenMove(viewer, tileRequestManager);
  configureCameraControls(viewer);
}
