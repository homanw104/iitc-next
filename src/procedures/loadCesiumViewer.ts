import { safeWindow } from "../utils/window";
import { logManager } from "../managers/logManager";
import { createCoreManagers, exposeCoreManagers } from "../core/coreManagers";
import { mountCoreUi } from "../core/coreUi";
import { createCesiumContainer } from "../cesium/setup/createCesiumContainer";
import { initCesiumViewer } from "../cesium/setup/initCesiumViewer";
import { setInitialView } from "../cesium/setup/setInitialView";
import { setupTileUpdateWhenMove } from "../cesium/setup/setupTileUpdateWhenMove.ts";
import { configureCameraControls } from "../cesium/interaction/configureCameraControls";
import { setupInteractionHandlers } from "../cesium/interaction/setupInteractionHandlers";

export default function loadCesiumViewer(): void {
  logManager.debug("CesiumViewer", "Loading");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  setInitialView(viewer);

  const managers = createCoreManagers(viewer, container);
  const {
    layerManager,
    portalEntityManager,
    portalHistoryEntityManager,
    scoutHistoryEntityManager,
    tileRequestManager,
  } = managers;

  // Expose managers to the global iitc object
  if (safeWindow) exposeCoreManagers(safeWindow.iitc, viewer, managers);

  // Mount core UI and get portal details UI and portal data in state
  const { portalDetailUI, state } = mountCoreUi(viewer, container, managers);

  setupInteractionHandlers(viewer, container, portalDetailUI, layerManager, portalEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, state);
  setupTileUpdateWhenMove(viewer, tileRequestManager);
  configureCameraControls(viewer);
}
