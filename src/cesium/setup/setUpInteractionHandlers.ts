/**
 * Wires Cesium screen-space events to IITC touch, pinch, and portal handlers.
 */

import { ScreenSpaceEventType } from "cesium";
import * as Cesium from "cesium";
import type { PortalDetailPaneController } from "../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "./mountCoreControllersAndUI.ts";
import type { PortalManager } from "../../managers/entity/portalManager.ts";
import type { PortalHistoryManager } from "../../managers/entity/portalHistoryManager.ts";
import type { PortalLabelManager } from "../../managers/entity/portalLabelManager.ts";
import type { PortalOrnamentManager } from "../../managers/entity/portalOrnamentManager.ts";
import type { ScoutHistoryManager } from "../../managers/entity/scoutHistoryManager.ts";
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
  portalManager: PortalManager,
  portalLabelManager: PortalLabelManager,
  portalOrnamentManager: PortalOrnamentManager,
  portalHistoryManager: PortalHistoryManager,
  scoutHistoryManager: ScoutHistoryManager,
  portalDetailState: PortalDetailState,
): void {
  const handler = viewer.screenSpaceEventHandler;
  const controller = viewer.scene.screenSpaceCameraController;
  const gestureState = createInteractionGestureState();

  const portalSelectionState: PortalSelectionState = {
    activeRequestId: 0,
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
      portalManager,
      portalLabelManager,
      portalOrnamentManager,
      portalHistoryManager,
      scoutHistoryManager,
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
