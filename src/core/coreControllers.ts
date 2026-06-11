/**
 * Mounts the built-in IITC UI panes, buttons, and log-backed portal detail bar.
 */

import type * as Cesium from "cesium";
import type { PortalData } from "../types/ingress";
import GameDetailButton from "../components/GameDetailButton/GameDetailButton";
import GetLocationButton from "../components/GetLocationButton/GetLocationButton";
import SoftRefreshButton from "../components/SoftRefreshButton/SoftRefreshButton";
import CommDetailButton from "../components/CommDetailButton/CommDetailButton";
import LayerChooserButton from "../components/LayerChooserButton/LayerChooserButton";
import PortalDetailBar from "../components/PortalDetailBar/PortalDetailBar";
import { CommDetailPaneController } from "../controllers/CommDetailPaneController.tsx";
import { GameDetailPaneController } from "../controllers/GameDetailPaneController.tsx";
import { PortalDetailPaneController } from "../controllers/PortalDetailPaneController.tsx";
import { SoftRefreshButtonController } from "../controllers/SoftRefreshButtonController.tsx";
import { LayerChooserPaneController } from "../controllers/LayerChooserPaneController.tsx";
import { logManager } from "../managers/logManager";
import type { CoreManagers } from "./coreManagers";

export interface PortalDetailState {
  lastLogMsg: string;
  lastPortalData: PortalData | null;
  portalDetailBar: HTMLElement | null;
}

export interface CoreControllers {
  portalDetailPaneController: PortalDetailPaneController;
  state: PortalDetailState;
}

export function mountCoreControllersAndUI(viewer: Cesium.Viewer, container: HTMLElement, managers: CoreManagers): CoreControllers {
  const state: PortalDetailState = {
    lastLogMsg: "Loading...",
    lastPortalData: null,
    portalDetailBar: null,
  };

  const softRefreshButtonController = new SoftRefreshButtonController(viewer, managers.tileRequestManager);
  const layerChooserPaneController = new LayerChooserPaneController(container, managers.layerManager);
  const portalDetailPaneController = new PortalDetailPaneController(container);
  const gameDetailPaneController = new GameDetailPaneController(container, managers.scoreManager, managers.redeemManager);
  const commDetailPaneController = new CommDetailPaneController(
    viewer,
    container,
    managers.commManager,
    managers.portalEntityManager,
    managers.tileRequestManager,
    managers.portalHistoryEntityManager,
    managers.scoutHistoryEntityManager,
    portalDetailPaneController,
    state
  );

  state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController }));
  container.appendChild(GetLocationButton({ viewer }));
  container.appendChild(SoftRefreshButton({ softRefreshButtonController: softRefreshButtonController }));
  container.appendChild(CommDetailButton({ commDetailPaneController: commDetailPaneController }));
  container.appendChild(LayerChooserButton({ layerChooserPaneController: layerChooserPaneController }));
  container.appendChild(GameDetailButton({ gameDetailPaneController: gameDetailPaneController }));

  logManager.setCallback((msg: string) => {
    state.lastLogMsg = msg;
    state.portalDetailBar?.remove();

    if (state.lastPortalData) {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: state.lastPortalData }));
    } else {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, msg: state.lastLogMsg }));
    }
  });

  return { portalDetailPaneController: portalDetailPaneController, state };
}
