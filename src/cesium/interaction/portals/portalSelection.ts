/**
 * Handles portal picking and detail display updates from Cesium interactions.
 */

import * as Cesium from "cesium";
import PortalDetailBar from "../../../components/buttons/PortalDetailBar/PortalDetailBar";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../setup/mountCoreControllersAndUI.ts";
import type { PortalEntityManager } from "../../../managers/entity/portalEntityManager";
import type { PortalHistoryEntityManager } from "../../../managers/entity/portalHistoryEntityManager";
import type { PortalLabelEntityManager } from "../../../managers/entity/portalLabelEntityManager.ts";
import type { PortalOrnamentEntityManager } from "../../../managers/entity/portalOrnamentEntityManager.ts";
import type { ScoutHistoryEntityManager } from "../../../managers/entity/scoutHistoryEntityManager";
import type { InteractionGestureState } from "../state/interactionGestureState";
import { PortalData } from "../../../types/ingress.ts";

export interface PortalSelectionState {
  isPortalDetailLoading: boolean;
  hasCancelledDisplayPortalDetail: boolean;
  lastPortalEntity?: Cesium.Entity;
}

export type PortalSelectionGestureState = Pick<
  InteractionGestureState,
  "hasJustDoubleTapped" | "isDuringTheTap" | "hasJustPinched" | "isPinching" | "hasJustMoved"
>;

interface HandlePortalSelectionOptions {
  viewer: Cesium.Viewer;
  container: HTMLElement;
  portalDetailPaneController: PortalDetailPaneController;
  portalEntityManager: PortalEntityManager;
  portalLabelEntityManager: PortalLabelEntityManager;
  portalOrnamentEntityManager: PortalOrnamentEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  interfaceState: PortalDetailState;
  selectionState: PortalSelectionState;
  gestureState: PortalSelectionGestureState;
  doubleTapThreshold: number;
  position: Cesium.Cartesian2;
}

export function handlePortalSelection({
  viewer,
  container,
  portalDetailPaneController,
  portalEntityManager,
  portalLabelEntityManager,
  portalOrnamentEntityManager,
  portalHistoryEntityManager,
  scoutHistoryEntityManager,
  interfaceState,
  selectionState,
  gestureState,
  doubleTapThreshold,
  position,
}: HandlePortalSelectionOptions): void {
  const displayPortalDetailAfter = performance.now() + doubleTapThreshold;
  const pickedObjects = viewer.scene.drillPick(position);
  const portalEntity = getPickedPortalEntity(pickedObjects);

  if (selectionState.isPortalDetailLoading && selectionState.lastPortalEntity !== portalEntity) {
    selectionState.hasCancelledDisplayPortalDetail = true;
  }
  selectionState.lastPortalEntity = portalEntity;

  if (portalEntity) {
    const portalGuid = portalEntity.id.substring(7);
    const staleData: PortalData | undefined = portalEntityManager.getPortalData(portalGuid);
    let freshData: PortalData | undefined = undefined;

    portalEntityManager.postponeLayerMove(portalGuid);

    if (staleData) {
      window.setTimeout(() => {
        if (freshData) return;
        if (selectionState.lastPortalEntity === portalEntity && !isPortalDisplaySuppressed(gestureState)) {
          viewer.selectedEntity = portalEntity;
          interfaceState.lastPortalData = staleData;
          interfaceState.portalDetailBar?.remove();
          interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: staleData }));
          portalDetailPaneController.updateDetailPane(staleData);
        }
        portalEntityManager.releasePostponedLayerMove(portalGuid);
      }, doubleTapThreshold);
    }

    selectionState.isPortalDetailLoading = true;

    portalEntityManager.requestPortalDetails(portalGuid).then(() => {
      window.setTimeout(() => {
        if (selectionState.lastPortalEntity === portalEntity && !isPortalDisplaySuppressed(gestureState)) {
          freshData = portalEntityManager.getPortalData(portalGuid);
          if (freshData) {
            viewer.selectedEntity = portalEntity;
            interfaceState.lastPortalData = freshData;
            interfaceState.portalDetailBar?.remove();
            interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: freshData }));
            portalDetailPaneController.updateDetailPane(freshData);
            portalLabelEntityManager.addOrUpdateLabel(freshData).then();
            portalOrnamentEntityManager.addOrUpdateOrnament(freshData).then();
            portalHistoryEntityManager.addOrUpdateHistoryHalo(freshData).then();
            scoutHistoryEntityManager.addOrUpdateScoutControlHalo(freshData).then();
          }
        }
        portalEntityManager.releasePostponedLayerMove(portalGuid);
      }, Math.max(0, displayPortalDetailAfter - performance.now()));
    }).finally(() => {
      selectionState.isPortalDetailLoading = false;
    });
  } else {
    window.setTimeout(() => {
      if (!isPortalDisplaySuppressed(gestureState)) {
        viewer.selectedEntity = undefined;
        interfaceState.lastPortalData = null;
        interfaceState.portalDetailBar?.remove();
        interfaceState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, msg: interfaceState.lastLogMsg }));
        portalDetailPaneController.removeDetailPane();
      }
    }, doubleTapThreshold);
  }
}

function getPickedPortalEntity(pickedObjects: unknown[]): Cesium.Entity | undefined {
  const picked = pickedObjects.find(
    (o): o is { id: Cesium.Entity } =>
      (typeof o === "object") &&
      (o !== null) &&
      ("id" in o) &&
      (isPortalEntity(o.id))
  );
  return picked?.id;
}

function isPortalEntity(entity: unknown): entity is Cesium.Entity {
  return (
    entity instanceof Cesium.Entity &&
    entity.id.startsWith("portal-") &&
    entity.properties?.selectable?.getValue() === true
  );
}

function isPortalDisplaySuppressed(gestureState: PortalSelectionGestureState): boolean {
  return gestureState.hasJustDoubleTapped ||
    gestureState.isDuringTheTap ||
    gestureState.hasJustPinched ||
    gestureState.isPinching ||
    gestureState.hasJustMoved;
}
