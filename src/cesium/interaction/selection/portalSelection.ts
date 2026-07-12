/**
 * Handles portal picking and detail display updates from Cesium interactions.
 */

import * as Cesium from "cesium";
import PortalDetailBar from "../../../components/buttons/PortalDetailBar/PortalDetailBar";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../setup/mountCoreControllersAndUI.ts";
import { isPortalPrimitiveId, type PortalManager } from "../../../managers/entity/portalManager";
import type { PortalHistoryManager } from "../../../managers/entity/portalHistoryManager";
import type { PortalLabelManager } from "../../../managers/entity/portalLabelManager.ts";
import type { PortalOrnamentManager } from "../../../managers/entity/portalOrnamentManager.ts";
import type { ScoutHistoryManager } from "../../../managers/entity/scoutHistoryManager";
import type { InteractionGestureState } from "../state/interactionGestureState";
import type { PortalData } from "../../../types/iitc/portal.ts";
import { restoreSceneAfterPick } from "../picking/restoreSceneAfterPick.ts";

export interface PortalSelectionState {
  activeRequestId: number;
}

interface PortalSelectionRequest {
  id: number;
  cancellationVersion: number;
}

interface HandlePortalSelectionOptions {
  viewer: Cesium.Viewer;
  container: HTMLElement;
  portalDetailPaneController: PortalDetailPaneController;
  portalManager: PortalManager;
  portalLabelManager: PortalLabelManager;
  portalOrnamentManager: PortalOrnamentManager;
  portalHistoryManager: PortalHistoryManager;
  scoutHistoryManager: ScoutHistoryManager;
  interfaceState: PortalDetailState;
  selectionState: PortalSelectionState;
  gestureState: InteractionGestureState;
  doubleTapThreshold: number;
  position: Cesium.Cartesian2;
}

export function handlePortalSelection({
  viewer,
  container,
  portalDetailPaneController,
  portalManager,
  portalLabelManager,
  portalOrnamentManager,
  portalHistoryManager,
  scoutHistoryManager,
  interfaceState,
  selectionState,
  gestureState,
  doubleTapThreshold,
  position,
}: HandlePortalSelectionOptions): void {
  if (isPortalSelectionGestureBlocked(gestureState)) return;

  const request: PortalSelectionRequest = {
    id: ++selectionState.activeRequestId,
    cancellationVersion: gestureState.portalSelectionCancellationVersion,
  };

  const displayPortalDetail = (portalEntity: Cesium.Entity, data: PortalData) => {
    viewer.selectedEntity = portalEntity;
    interfaceState.lastPortalData = data;
    interfaceState.portalDetailBar?.remove();
    interfaceState.portalDetailBar = container.appendChild(
      PortalDetailBar({ portalDetailPaneController, data }),
    );
    portalDetailPaneController.updateDetailPane(data);
  };

  const updatePortalDecorations = (data: PortalData) => {
    portalLabelManager.addOrUpdateLabel(data).then();
    portalOrnamentManager.addOrUpdateOrnament(data).then();
    portalHistoryManager.addOrUpdateHistoryHalo(data).then();
    scoutHistoryManager.addOrUpdateScoutControlHalo(data).then();
  };

  const displayNoPortalDetail = () => {
    viewer.selectedEntity = undefined;
    interfaceState.lastPortalData = null;
    interfaceState.portalDetailBar?.remove();
    interfaceState.portalDetailBar = container.appendChild(
      PortalDetailBar({ portalDetailPaneController, msg: interfaceState.lastLogMsg }),
    );
    portalDetailPaneController.removeDetailPane();
  };

  const displayPortalDetailAfter = performance.now() + doubleTapThreshold;
  scheduleLongPressCancellation(
    selectionState,
    gestureState,
    request,
    doubleTapThreshold,
  );

  window.requestAnimationFrame(() => {
    if (selectionState.activeRequestId !== request.id) return;

    const pickedObject = viewer.scene.pick(position);
    restoreSceneAfterPick(viewer.scene);

    const portalGuid = getPickedPortalGuid(pickedObject);
    const portalEntity = portalGuid ? portalManager.getPortalEntity(portalGuid) : undefined;

    if (portalGuid && portalEntity) {
      const staleData: PortalData | undefined = portalManager.getPortalData(portalGuid);
      let freshData: PortalData | undefined = undefined;

      portalManager.postponeLayerMove(portalGuid);

      if (staleData) {
        window.setTimeout(() => {
          if (freshData) return;
          if (shouldDisplayPortalSelection(selectionState, gestureState, request)) {
            displayPortalDetail(portalEntity, staleData);
          }
          portalManager.releasePostponedLayerMove(portalGuid);
        }, doubleTapThreshold);
      }

      portalManager.requestPortalDetails(portalGuid)
        .then(() => {
          window.setTimeout(() => {
            if (shouldDisplayPortalSelection(selectionState, gestureState, request)) {
              freshData = portalManager.getPortalData(portalGuid);
              if (freshData) {
                displayPortalDetail(portalEntity, freshData);
                updatePortalDecorations(freshData);
              }
            }
            portalManager.releasePostponedLayerMove(portalGuid);
          }, Math.max(0, displayPortalDetailAfter - performance.now()));
        })
        .catch(() => portalManager.releasePostponedLayerMove(portalGuid));
    } else {
      window.setTimeout(() => {
        if (shouldDisplayPortalSelection(selectionState, gestureState, request)) {
          displayNoPortalDetail();
        }
      }, Math.max(0, displayPortalDetailAfter - performance.now()));
    }
  });
}

function getPickedPortalGuid(pickedObject: unknown): string | undefined {
  if (typeof pickedObject !== "object" || pickedObject === null || !("id" in pickedObject)) return undefined;
  return isPortalPrimitiveId(pickedObject.id) ? pickedObject.id.guid : undefined;
}

function scheduleLongPressCancellation(
  selectionState: PortalSelectionState,
  gestureState: InteractionGestureState,
  request: PortalSelectionRequest,
  doubleTapThreshold: number,
): void {
  window.setTimeout(() => {
    if (
      isPortalSelectionRequestCurrent(selectionState, gestureState, request) &&
      gestureState.isDuringTheTap
    ) {
      gestureState.portalSelectionCancellationVersion += 1;
    }
  }, doubleTapThreshold);
}

function shouldDisplayPortalSelection(
  selectionState: PortalSelectionState,
  gestureState: InteractionGestureState,
  request: PortalSelectionRequest,
): boolean {
  if (!isPortalSelectionRequestCurrent(selectionState, gestureState, request)) return false;

  if (gestureState.isDuringTheTap) {
    gestureState.portalSelectionCancellationVersion += 1;
    return false;
  }

  return !isPortalSelectionGestureBlocked(gestureState);
}

function isPortalSelectionRequestCurrent(
  selectionState: PortalSelectionState,
  gestureState: InteractionGestureState,
  request: PortalSelectionRequest,
): boolean {
  return selectionState.activeRequestId === request.id &&
    gestureState.portalSelectionCancellationVersion === request.cancellationVersion;
}

function isPortalSelectionGestureBlocked(gestureState: InteractionGestureState): boolean {
  return gestureState.hasJustDoubleTapped ||
    gestureState.hasJustPinched ||
    gestureState.isPinching ||
    gestureState.hasJustMoved;
}
