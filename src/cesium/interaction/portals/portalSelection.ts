/**
 * Handles portal picking and detail display updates from Cesium interactions.
 */

import * as Cesium from "cesium";
import type { LayerManager } from "../../../managers/layerManager";
import { getPortalLayerId } from "../../../managers/portalEntityManager";
import type { PortalEntityManager } from "../../../managers/portalEntityManager";
import type { PortalHistoryEntityManager } from "../../../managers/portalHistoryEntityManager";
import type { ScoutHistoryEntityManager } from "../../../managers/scoutHistoryEntityManager";
import PortalDetailBar from "../../../components/PortalDetailBar/PortalDetailBar";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../../core/coreControllers.ts";
import type { InteractionGestureState } from "../state/interactionGestureState";

export interface PortalSelectionState {
  isPortalDetailLoading: boolean;
  hasCancelledDisplayPortalDetail: boolean;
  lastPortalEntity?: Cesium.Entity;
}

export type PortalSelectionGestureState = Pick<
  InteractionGestureState,
  "hasJustDoubleTapped" | "isDuringTheTap" | "hasJustPinched" | "isPinching" | "lastTapTime"
>;

interface HandlePortalSelectionOptions {
  viewer: Cesium.Viewer;
  container: HTMLElement;
  portalDetailPaneController: PortalDetailPaneController;
  layerManager: LayerManager;
  portalEntityManager: PortalEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  interfaceState: PortalDetailState;
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
  portalDetailPaneController,
  layerManager,
  portalEntityManager,
  portalHistoryEntityManager,
  scoutHistoryEntityManager,
  interfaceState,
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
      interfaceState.lastPortalData = portalData;
      interfaceState.portalDetailBar?.remove();
      interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: portalData }));
      portalDetailPaneController.updateDetailPane(portalData);
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
        interfaceState.lastPortalData = freshData;
        interfaceState.portalDetailBar?.remove();
        interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: freshData }));
        portalDetailPaneController.updateDetailPane(freshData);
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
      interfaceState.lastPortalData = null;
      interfaceState.portalDetailBar?.remove();
      interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, msg: interfaceState.lastLogMsg }));
      portalDetailPaneController.removeDetailPane();
    }, doubleTapThreshold);
  }
}
