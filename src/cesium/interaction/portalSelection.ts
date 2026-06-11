import * as Cesium from "cesium";
import type { LayerManager } from "../../managers/layerManager";
import { getPortalLayerId } from "../../managers/portalEntityManager";
import type { PortalEntityManager } from "../../managers/portalEntityManager";
import type { PortalHistoryEntityManager } from "../../managers/portalHistoryEntityManager";
import type { ScoutHistoryEntityManager } from "../../managers/scoutHistoryEntityManager";
import PortalDetailBar from "../../components/PortalDetailBar/PortalDetailBar";
import type { PortalDetailPaneUI } from "../../interface/PortalDetailPaneUI";
import type { PortalDetailState } from "../../core/coreUi";

export interface PortalSelectionState {
  isPortalDetailLoading: boolean;
  hasCancelledDisplayPortalDetail: boolean;
  lastPortalEntity?: Cesium.Entity;
}

export interface PortalSelectionGestureState {
  hasJustDoubleTapped: boolean;
  isDuringTheTap: boolean;
  hasJustPinched: boolean;
  isPinching: boolean;
  lastTapTime: number;
}

interface HandlePortalSelectionOptions {
  viewer: Cesium.Viewer;
  container: HTMLElement;
  portalDetailUI: PortalDetailPaneUI;
  layerManager: LayerManager;
  portalEntityManager: PortalEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  state: PortalDetailState;
  selectionState: PortalSelectionState;
  gestureState: PortalSelectionGestureState;
  doubleTapThreshold: number;
  position: Cesium.Cartesian2;
}

function isPortalDisplaySuppressed(gestureState: PortalSelectionGestureState): boolean {
  return gestureState.hasJustDoubleTapped ||
    gestureState.isDuringTheTap ||
    gestureState.hasJustPinched ||
    gestureState.isPinching;
}

export function handlePortalSelection({
  viewer,
  container,
  portalDetailUI,
  layerManager,
  portalEntityManager,
  portalHistoryEntityManager,
  scoutHistoryEntityManager,
  state,
  selectionState,
  gestureState,
  doubleTapThreshold,
  position,
}: HandlePortalSelectionOptions): void {
  const pickedObjects = viewer.scene.drillPick(position);
  const portalEntity = pickedObjects.find(
    (o) =>
      (o.id instanceof Cesium.Entity) &&
      (o.id.id.startsWith("portal-")) &&
      (o.id as Cesium.Entity).properties?.selectable?.getValue()
  )?.id as Cesium.Entity | undefined;

  if (selectionState.isPortalDetailLoading && selectionState.lastPortalEntity !== portalEntity) {
    selectionState.hasCancelledDisplayPortalDetail = true;
  }
  selectionState.lastPortalEntity = portalEntity;

  if (portalEntity) {
    const portalGuid = portalEntity.id.substring(7);
    const portalData = portalEntityManager.getPortalData(portalGuid);
    if (!portalData) return;

    setTimeout(() => {
      if (isPortalDisplaySuppressed(gestureState)) return;
      state.lastPortalData = portalData;
      state.portalDetailBar?.remove();
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: portalData }));
      portalDetailUI.updateDetailPane(portalData);
    }, doubleTapThreshold);

    selectionState.isPortalDetailLoading = true;
    portalEntityManager.requestPortalDetails(portalGuid).then(() => {
      setTimeout(() => {
        if (isPortalDisplaySuppressed(gestureState)) {
          if (selectionState.hasCancelledDisplayPortalDetail) selectionState.hasCancelledDisplayPortalDetail = false;
          return;
        }

        const freshData = portalEntityManager.getPortalData(portalGuid);
        if (!freshData) return;
        const layerId = getPortalLayerId(freshData);
        const source = layerManager.getOrCreateSourceAndFilter(layerId);
        viewer.selectedEntity = source.entities.getById(`portal-${portalGuid}`);
        state.lastPortalData = freshData;
        state.portalDetailBar?.remove();
        state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: freshData }));
        portalDetailUI.updateDetailPane(freshData);
        portalHistoryEntityManager.addOrUpdateHistoryHalo(freshData);
        scoutHistoryEntityManager.addOrUpdateScoutControlHalo(freshData);
      }, Math.max(0, gestureState.lastTapTime + doubleTapThreshold - Date.now()));
    }).finally(() => {
      selectionState.isPortalDetailLoading = false;
    });
  } else {
    setTimeout(() => {
      if (isPortalDisplaySuppressed(gestureState)) return;

      viewer.selectedEntity = undefined;
      state.lastPortalData = null;
      state.portalDetailBar?.remove();
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, msg: state.lastLogMsg }));
      portalDetailUI.removeDetailPane();
    }, doubleTapThreshold);
  }
}
