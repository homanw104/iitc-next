/**
 * Mounts the built-in IITC UI panes, buttons, and log-backed portal detail bar.
 */

import type * as Cesium from "cesium";
import type { PortalData } from "../types/ingress";
import ProfileButton from "../components/buttons/ProfileButton/ProfileButton.tsx";
import GetLocationButton from "../components/buttons/GetLocationButton/GetLocationButton";
import SoftRefreshButton from "../components/buttons/SoftRefreshButton/SoftRefreshButton";
import CommButton from "../components/buttons/CommButton/CommButton.tsx";
import LayerChooserButton from "../components/buttons/LayerChooserButton/LayerChooserButton";
import PortalDetailBar from "../components/buttons/PortalDetailBar/PortalDetailBar";
import { CommPaneController } from "../controllers/CommPaneController.tsx";
import { ProfilePaneController } from "../controllers/ProfilePaneController.tsx";
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

  const softRefreshButtonController = new SoftRefreshButtonController(managers.tileRequestManager);
  const layerChooserPaneController = new LayerChooserPaneController(container, managers.layerManager);
  const portalDetailPaneController = new PortalDetailPaneController(container);
  const gameDetailPaneController = new ProfilePaneController(container, managers.scoreManager, managers.redeemManager, managers.tileRequestManager);
  const commDetailPaneController = new CommPaneController(
    viewer,
    container,
    managers.commManager,
    managers.tileRequestManager,
    managers.portalEntityManager,
    managers.portalLabelEntityManager,
    managers.portalOrnamentEntityManager,
    managers.portalHistoryEntityManager,
    managers.scoutHistoryEntityManager,
    portalDetailPaneController,
    state,
  );

  state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController }));
  container.appendChild(GetLocationButton({ viewer }));
  container.appendChild(SoftRefreshButton({ softRefreshButtonController: softRefreshButtonController }));
  container.appendChild(CommButton({ commDetailPaneController: commDetailPaneController }));
  container.appendChild(LayerChooserButton({ layerChooserPaneController: layerChooserPaneController }));
  container.appendChild(ProfileButton({ gameDetailPaneController: gameDetailPaneController }));

  logManager.subscribe((entry) => {
    state.lastLogMsg = entry.args.join(" ");
    state.portalDetailBar?.remove();

    if (state.lastPortalData) {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: state.lastPortalData }));
    } else {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, msg: state.lastLogMsg }));
    }
  });

  return { portalDetailPaneController: portalDetailPaneController, state };
}
