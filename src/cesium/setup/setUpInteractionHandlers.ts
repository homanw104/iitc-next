/**
 * Wires Cesium screen-space events to IITC touch, pinch, and portal handlers.
 */

import * as Cesium from "cesium";
import { ScreenSpaceEventType } from "cesium";
import type { LayerManager } from "../../managers/layerManager.ts";
import type { PortalEntityManager } from "../../managers/portalEntityManager.ts";
import type { PortalHistoryEntityManager } from "../../managers/portalHistoryEntityManager.ts";
import type { ScoutHistoryEntityManager } from "../../managers/scoutHistoryEntityManager.ts";
import type { PortalDetailPaneController } from "../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../core/coreControllers.ts";
import { createInteractionGestureState } from "../interaction/state/interactionGestureState.ts";
import { handlePortalSelection } from "../interaction/portals/portalSelection.ts";
import type { PortalSelectionState } from "../interaction/portals/portalSelection.ts";
import { createPinchGestureHandlers } from "../interaction/gestures/pinchGestureHandlers.ts";
import { createTouchZoomHandlers } from "../interaction/gestures/touchZoomHandlers.ts";

const DOUBLE_TAP_THRESHOLD = 300; // ms

export function setUpInteractionHandlers(
  viewer: Cesium.Viewer,
  container: HTMLElement,
  portalDetailPaneController: PortalDetailPaneController,
  layerManager: LayerManager,
  portalEntityManager: PortalEntityManager,
  portalHistoryEntityManager: PortalHistoryEntityManager,
  scoutHistoryEntityManager: ScoutHistoryEntityManager,
  portalDetailState: PortalDetailState,
): void {
  const handler = viewer.screenSpaceEventHandler;
  const controller = viewer.scene.screenSpaceCameraController;
  const gestureState = createInteractionGestureState();

  const portalSelectionState: PortalSelectionState = {
    isPortalDetailLoading: false,
    hasCancelledDisplayPortalDetail: false,
  };
  const touchZoomHandlers = createTouchZoomHandlers(viewer, controller, gestureState, DOUBLE_TAP_THRESHOLD);
  const pinchGestureHandlers = createPinchGestureHandlers(viewer, handler, controller, gestureState, DOUBLE_TAP_THRESHOLD);

  // Remove default callbacks
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    touchZoomHandlers.handleTouchStart(event);

    handlePortalSelection({
      viewer,
      container,
      portalDetailPaneController,
      layerManager,
      portalEntityManager,
      portalHistoryEntityManager,
      scoutHistoryEntityManager,
      interfaceState: portalDetailState,
      selectionState: portalSelectionState,
      gestureState: gestureState,
      doubleTapThreshold: DOUBLE_TAP_THRESHOLD,
      position: event.position,
    });
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction(touchZoomHandlers.handleDrag, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction(touchZoomHandlers.handleTouchEnd, Cesium.ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(pinchGestureHandlers.handlePinchStart, ScreenSpaceEventType.PINCH_START);

  // @ts-expect-error - Cesium type definitions for PINCH_MOVE are incorrect
  handler.setInputAction(pinchGestureHandlers.handlePinchMove, ScreenSpaceEventType.PINCH_MOVE);
  handler.setInputAction(pinchGestureHandlers.handlePinchEnd, ScreenSpaceEventType.PINCH_END);
}
