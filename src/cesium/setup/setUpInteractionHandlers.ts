/**
 * Wires Cesium screen-space events to IITC touch, pinch, and portal handlers.
 */

import { ScreenSpaceEventType } from "cesium";
import * as Cesium from "cesium";
import type { PortalDetailPaneController } from "../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "./mountCoreControllersAndUI.ts";
import type { PortalEntityManager } from "../../managers/entity/portalEntityManager.ts";
import type { PortalHistoryEntityManager } from "../../managers/entity/portalHistoryEntityManager.ts";
import type { PortalLabelEntityManager } from "../../managers/entity/portalLabelEntityManager.ts";
import type { PortalOrnamentEntityManager } from "../../managers/entity/portalOrnamentEntityManager.ts";
import type { ScoutHistoryEntityManager } from "../../managers/entity/scoutHistoryEntityManager.ts";
import { createInteractionGestureState } from "../interaction/state/interactionGestureState.ts";
import { createPinchGestureHandlers } from "../interaction/gesture/pinchGestureHandlers.ts";
import { createTouchZoomHandlers } from "../interaction/gesture/touchZoomHandlers.ts";
import { handlePortalSelection } from "../interaction/selection/portalSelection.ts";
import type { PortalSelectionState } from "../interaction/selection/portalSelection.ts";

const DOUBLE_TAP_THRESHOLD = 300; // ms

export function setUpInteractionHandlers(
  viewer: Cesium.Viewer,
  container: HTMLElement,
  portalDetailPaneController: PortalDetailPaneController,
  portalEntityManager: PortalEntityManager,
  portalLabelEntityManager: PortalLabelEntityManager,
  portalOrnamentEntityManager: PortalOrnamentEntityManager,
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
      portalEntityManager,
      portalLabelEntityManager,
      portalOrnamentEntityManager,
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
