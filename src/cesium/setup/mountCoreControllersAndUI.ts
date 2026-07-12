/**
 * Mounts the built-in IITC UI panes, buttons, and log-backed portal detail bar.
 */

import type * as Cesium from "cesium";
import CommButton from "../../components/buttons/CommButton/CommButton.tsx";
import GetLocationButton from "../../components/buttons/GetLocationButton/GetLocationButton.tsx";
import LayerChooserButton from "../../components/buttons/LayerChooserButton/LayerChooserButton.tsx";
import PortalDetailBar from "../../components/buttons/PortalDetailBar/PortalDetailBar.tsx";
import ProfileButton from "../../components/buttons/ProfileButton/ProfileButton.tsx";
import SoftRefreshButton from "../../components/buttons/SoftRefreshButton/SoftRefreshButton.tsx";
import { CommPaneController } from "../../controllers/CommPaneController.tsx";
import { LayerChooserPaneController } from "../../controllers/LayerChooserPaneController.tsx";
import { PortalDetailPaneController } from "../../controllers/PortalDetailPaneController.tsx";
import { ProfilePaneController } from "../../controllers/ProfilePaneController.tsx";
import { SoftRefreshButtonController } from "../../controllers/SoftRefreshButtonController.tsx";
import { logManager } from "../../managers/system/logManager.ts";
import type { PortalData } from "../../types/iitc/portal.ts";
import type { CoreManagers } from "./createCoreManagers.ts";

export type RegisterActivePaneCloseCallback = (closePane: () => void) => () => void;

export interface PortalDetailState {
  lastLogMsg: string;
  lastPortalData: PortalData | null;
  portalDetailBar: HTMLElement | null;
}

export interface CoreControllers {
  portalDetailPaneController: PortalDetailPaneController;
  portalDetailState: PortalDetailState;
}

export function mountCoreControllersAndUI(viewer: Cesium.Viewer, container: HTMLElement, managers: CoreManagers): CoreControllers {
  let activePaneCloseCallback: (() => void) | null = null;

  const registerActivePaneCloseCallback: RegisterActivePaneCloseCallback = (closePane) => {
    activePaneCloseCallback?.();
    activePaneCloseCallback = closePane;
    return () => { if (activePaneCloseCallback === closePane) activePaneCloseCallback = null; };
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") activePaneCloseCallback?.();
  });

  const portalDetailState: PortalDetailState = {
    lastLogMsg: "Loading...",
    lastPortalData: null,
    portalDetailBar: null,
  };

  const softRefreshButtonController = new SoftRefreshButtonController(managers.tileRequestManager);
  const layerChooserPaneController = new LayerChooserPaneController(
    container,
    managers.layerManager,
    registerActivePaneCloseCallback,
  );
  const portalDetailPaneController = new PortalDetailPaneController(
    container,
    registerActivePaneCloseCallback,
  );
  const gameDetailPaneController = new ProfilePaneController(
    container,
    managers.scoreManager,
    managers.redeemManager,
    managers.tileRequestManager,
    registerActivePaneCloseCallback,
  );
  const commDetailPaneController = new CommPaneController(
    viewer,
    container,
    managers.commManager,
    managers.tileRequestManager,
    managers.portalManager,
    managers.portalLabelManager,
    managers.portalOrnamentManager,
    managers.portalHistoryManager,
    managers.scoutHistoryManager,
    portalDetailPaneController,
    portalDetailState,
    registerActivePaneCloseCallback,
  );

  portalDetailState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController }));
  container.appendChild(GetLocationButton({ viewer }));
  container.appendChild(SoftRefreshButton({ softRefreshButtonController: softRefreshButtonController }));
  container.appendChild(CommButton({ commDetailPaneController: commDetailPaneController }));
  container.appendChild(LayerChooserButton({ layerChooserPaneController: layerChooserPaneController }));
  container.appendChild(ProfileButton({ gameDetailPaneController: gameDetailPaneController }));

  logManager.subscribe((entry) => {
    if (entry.level === "DEBUG") return;

    portalDetailState.lastLogMsg = entry.args.join(" ");
    if (portalDetailState.portalDetailBar && !portalDetailState.lastPortalData) {
      portalDetailPaneController.updateDetailBarText(undefined, portalDetailState.lastLogMsg);
    }
  });

  return { portalDetailPaneController: portalDetailPaneController, portalDetailState: portalDetailState };
}
