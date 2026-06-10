import type * as Cesium from "cesium";
import type { PortalData } from "../types/ingress";
import GameDetailButton from "../components/GameDetailButton/GameDetailButton";
import GetLocationButton from "../components/GetLocationButton/GetLocationButton";
import SoftRefreshButton from "../components/SoftRefreshButton/SoftRefreshButton";
import CommDetailButton from "../components/CommDetailButton/CommDetailButton";
import LayerChooserButton from "../components/LayerChooserButton/LayerChooserButton";
import PortalDetailBar from "../components/PortalDetailBar/PortalDetailBar";
import { CommDetailPaneUI } from "../interface/CommDetailPaneUI";
import { GameDetailPaneUI } from "../interface/GameDetailPaneUI";
import { PortalDetailPaneUI } from "../interface/PortalDetailPaneUI";
import { SoftRefreshUI } from "../interface/SoftRefreshUI";
import { LayerChooserPaneUI } from "../interface/LayerChooserPaneUI";
import { logManager } from "../managers/logManager";
import type { CoreManagers } from "./coreManagers";

export interface PortalDetailState {
  lastLogMsg: string;
  lastPortalData: PortalData | null;
  portalDetailBar: HTMLElement | null;
}

export interface CoreUi {
  portalDetailUI: PortalDetailPaneUI;
  state: PortalDetailState;
}

export function mountCoreUi(viewer: Cesium.Viewer, container: HTMLElement, managers: CoreManagers): CoreUi {
  const portalDetailUI = new PortalDetailPaneUI(container);
  const refreshPaneUI = new SoftRefreshUI(viewer, managers.tileRequestManager);
  const gameDetailPaneUI = new GameDetailPaneUI(container, managers.scoreManager, managers.redeemManager);
  const commDetailPaneUI = new CommDetailPaneUI(viewer, container, managers.commManager);
  const layerChooserPaneUI = new LayerChooserPaneUI(container, managers.layerManager);

  const state: PortalDetailState = {
    lastLogMsg: "Loading...",
    lastPortalData: null,
    portalDetailBar: null,
  };

  state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI }));
  container.appendChild(GetLocationButton({ viewer }));
  container.appendChild(SoftRefreshButton({ refreshPaneUI }));
  container.appendChild(CommDetailButton({ commDetailPaneUI }));
  container.appendChild(LayerChooserButton({ layerChooserPaneUI }));
  container.appendChild(GameDetailButton({ gameDetailPaneUI }));

  logManager.setCallback((msg: string) => {
    state.lastLogMsg = msg;
    state.portalDetailBar?.remove();

    if (state.lastPortalData) {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: state.lastPortalData }));
    } else {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, msg: state.lastLogMsg }));
    }
  });

  return { portalDetailUI, state };
}
