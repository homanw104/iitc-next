/**
 * Creates touch handlers for double-tap zoom and double-tap drag zoom.
 */

import * as Cesium from "cesium";
import {
  createGestureSurfacePicker,
  panCameraByOrbitingSurface,
} from "../camera/cameraGestures";
import type { InteractionGestureState } from "../state/interactionGestureState";

const DRAG_THRESHOLD_PIXELS = 8;
const DOUBLE_TAP_AND_DRAG_ZOOM_THRESHOLD_PIXELS = 4;
const ZOOM_VELOCITY_FRICTION_FACTOR = 0.84;
const RESET_INERTIA_TIMEOUT_MS = 1500;
const MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS = 5;
const TOUCH_EVENT_OPTIONS: AddEventListenerOptions = { passive: true };

interface TouchZoomHandlers {
  handleTouchStart: (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => void;
  handleDrag: (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => void;
  handleTouchEnd: (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => void;
}

export function createTouchZoomHandlers(
  viewer: Cesium.Viewer,
  controller: Cesium.ScreenSpaceCameraController,
  gestureState: InteractionGestureState,
  doubleTapThreshold: number,
): TouchZoomHandlers {
  const gestureSurfacePicker = createGestureSurfacePicker(viewer.scene);
  let lastMoveTime = 0;
  let zoomVelocity = 0;
  let totalMovementLength = 0;
  let isDuringTheSecondTap = false;
  let hasMovedDuringTheSecondTap = false;
  let activeTouchCount = 0;
  let isSingleTouchPanning = false;
  let inertiaResetTimeoutId: number | null = null;
  let revertHasJustMovedTimeoutId: number | null = null;
  let revertHasJustDoubleTappedTimeoutId: number | null = null;
  let dragFrameRequestId: number | null = null;
  let hasPendingDragFrame = false;
  let trackedTouchIdentifier: number | null = null;
  let hasLastTouchPosition = false;
  let hasActiveSingleTouchGesture = false;
  const pendingDragStartPosition = new Cesium.Cartesian2();
  const pendingDragEndPosition = new Cesium.Cartesian2();
  const lastTouchPosition = new Cesium.Cartesian2();
  const currentTouchPosition = new Cesium.Cartesian2();
  let pendingDragEventTime = 0;

  viewer.scene.canvas.addEventListener("touchstart", (event) => {
    activeTouchCount = event.touches.length;
    gestureSurfacePicker.reset();
    if (activeTouchCount === 1) {
      const touch = event.touches[0];
      trackedTouchIdentifier = touch.identifier;
      getCanvasTouchPosition(viewer.scene.canvas, touch, lastTouchPosition);
      hasLastTouchPosition = true;
      hasActiveSingleTouchGesture = true;
      controller.enableInputs = false;
    } else {
      cancelQueuedDragFrame();
      trackedTouchIdentifier = null;
      hasLastTouchPosition = false;
      hasActiveSingleTouchGesture = false;
      isSingleTouchPanning = false;
      controller.enableInputs = true;
    }
  }, TOUCH_EVENT_OPTIONS);

  viewer.scene.canvas.addEventListener("touchmove", (event) => {
    activeTouchCount = event.touches.length;
    if (activeTouchCount !== 1 || trackedTouchIdentifier === null) return;

    const touch = findTouchByIdentifier(event.touches, trackedTouchIdentifier);
    if (!touch) return;

    getCanvasTouchPosition(viewer.scene.canvas, touch, currentTouchPosition);
    if (!hasLastTouchPosition) {
      Cesium.Cartesian2.clone(currentTouchPosition, lastTouchPosition);
      hasLastTouchPosition = true;
      return;
    }

    handleDragPositions(lastTouchPosition, currentTouchPosition, Date.now());
    Cesium.Cartesian2.clone(currentTouchPosition, lastTouchPosition);
  }, TOUCH_EVENT_OPTIONS);

  viewer.scene.canvas.addEventListener("touchend", (event) => {
    activeTouchCount = event.touches.length;
    if (trackedTouchIdentifier !== null && findTouchByIdentifier(event.changedTouches, trackedTouchIdentifier)) {
      trackedTouchIdentifier = null;
      hasLastTouchPosition = false;
    }
  }, TOUCH_EVENT_OPTIONS);

  viewer.scene.canvas.addEventListener("touchcancel", (event) => {
    activeTouchCount = event.touches.length;
    if (trackedTouchIdentifier !== null && findTouchByIdentifier(event.changedTouches, trackedTouchIdentifier)) {
      trackedTouchIdentifier = null;
      hasLastTouchPosition = false;
      hasActiveSingleTouchGesture = false;
    }
    gestureSurfacePicker.reset();
    if (activeTouchCount === 0) {
      cancelQueuedDragFrame();
      isSingleTouchPanning = false;
      controller.enableInputs = true;
    }
  }, TOUCH_EVENT_OPTIONS);

  const handleTouchStart = () => {
    const now = Date.now();
    totalMovementLength = 0;
    hasMovedDuringTheSecondTap = false;
    gestureState.isDuringTheTap = true;

    if (gestureState.momentumRequestId) {
      window.cancelAnimationFrame(gestureState.momentumRequestId);
      gestureState.momentumRequestId = null;
    }

    if (inertiaResetTimeoutId) {
      window.clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }

    if (gestureState.pendingSingleTapTime !== null && now - gestureState.pendingSingleTapTime < doubleTapThreshold) {
      isDuringTheSecondTap = true;
      gestureState.pendingSingleTapTime = null;
      gestureState.hasJustDoubleTapped = true;
      controller.enableInputs = false;

      if (revertHasJustDoubleTappedTimeoutId) {
        window.clearTimeout(revertHasJustDoubleTappedTimeoutId);
        revertHasJustDoubleTappedTimeoutId = null;
      }
      revertHasJustDoubleTappedTimeoutId = window.setTimeout(() => gestureState.hasJustDoubleTapped = false, doubleTapThreshold * 2);
    } else {
      isDuringTheSecondTap = false;
      gestureState.pendingSingleTapTime = now;
      gestureState.hasJustDoubleTapped = false;
      controller.enableInputs = activeTouchCount !== 1;
    }
  };

  const handleDrag = (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (activeTouchCount > 0) return;

    handleDragPositions(event.startPosition, event.endPosition, Date.now());
  };

  const handleDragPositions = (
    startPosition: Cesium.Cartesian2,
    endPosition: Cesium.Cartesian2,
    now: number,
  ) => {
    const dx = endPosition.x - startPosition.x;
    const dy = endPosition.y - startPosition.y;

    const movement = Math.sqrt(dx * dx + dy * dy);
    if (movement === 0) return;

    totalMovementLength += movement;

    if (totalMovementLength > DRAG_THRESHOLD_PIXELS) gestureState.hasJustMoved = true;
    if (revertHasJustMovedTimeoutId) {
      window.clearTimeout(revertHasJustMovedTimeoutId);
      revertHasJustMovedTimeoutId = null;
    }
    revertHasJustMovedTimeoutId = window.setTimeout(() => gestureState.hasJustMoved = false, doubleTapThreshold);

    queueDragFrame(startPosition, endPosition, now);
  };

  const queueDragFrame = (
    startPosition: Cesium.Cartesian2,
    endPosition: Cesium.Cartesian2,
    now: number,
  ) => {
    if (!hasPendingDragFrame) {
      Cesium.Cartesian2.clone(startPosition, pendingDragStartPosition);
      hasPendingDragFrame = true;
    }
    Cesium.Cartesian2.clone(endPosition, pendingDragEndPosition);
    pendingDragEventTime = now;

    if (dragFrameRequestId !== null) return;
    dragFrameRequestId = window.requestAnimationFrame(applyQueuedDragFrame);
  };

  const cancelQueuedDragFrame = () => {
    if (dragFrameRequestId !== null) {
      window.cancelAnimationFrame(dragFrameRequestId);
      dragFrameRequestId = null;
    }
    hasPendingDragFrame = false;
  };

  const applyQueuedDragFrame = () => {
    dragFrameRequestId = null;

    if (!hasPendingDragFrame) return;
    hasPendingDragFrame = false;

    const dt = pendingDragEventTime - lastMoveTime;
    const dy = pendingDragEndPosition.y - pendingDragStartPosition.y;
    lastMoveTime = pendingDragEventTime;

    if (isDuringTheSecondTap) {
      if (totalMovementLength > DOUBLE_TAP_AND_DRAG_ZOOM_THRESHOLD_PIXELS) hasMovedDuringTheSecondTap = true;

      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;

      if (dt > 0) {
        const currentVelocity = dy / dt;
        zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
      }

      const height = viewer.camera.positionCartographic.height;
      const zoomFactor = height * 0.003;
      viewer.camera.zoomIn(dy * zoomFactor);
    } else if (hasActiveSingleTouchGesture && totalMovementLength > DRAG_THRESHOLD_PIXELS) {
      isSingleTouchPanning = true;
      controller.enableInputs = false;
      panCameraByOrbitingSurface(
        viewer.scene,
        pendingDragStartPosition,
        pendingDragEndPosition,
        gestureSurfacePicker,
      );
    }
  };

  const handleTouchEnd = (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    gestureState.isDuringTheTap = false;
    trackedTouchIdentifier = null;
    hasLastTouchPosition = false;
    if (dragFrameRequestId !== null) {
      window.cancelAnimationFrame(dragFrameRequestId);
      dragFrameRequestId = null;
      applyQueuedDragFrame();
    }
    gestureSurfacePicker.reset();

    if (isSingleTouchPanning) {
      isSingleTouchPanning = false;
      hasActiveSingleTouchGesture = false;
      controller.enableInputs = true;
    } else if (isDuringTheSecondTap) {
      isDuringTheSecondTap = false;
      hasActiveSingleTouchGesture = false;

      if (!hasMovedDuringTheSecondTap) {
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const targetHeight = height * 0.5;
        const destination = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
        if (destination) {
          const cartographic = Cesium.Cartographic.fromCartesian(destination);
          const surfaceHeight = viewer.scene.sampleHeightSupported
            ? viewer.scene.sampleHeight(cartographic)
            : undefined;
          cartographic.height = surfaceHeight === undefined
            ? targetHeight
            : Math.max(targetHeight, surfaceHeight + MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS);
          camera.flyTo({
            destination: Cesium.Cartographic.toCartesian(cartographic),
            duration: 0.5,
            complete: () => {
              controller.enableInputs = true;
            }
          });
        }
      } else if (Math.abs(zoomVelocity) > 0.1) {
        let lastFrameTime = Date.now();
        const animateMomentum = () => {
          const now = Date.now();
          const dt = now - lastFrameTime;
          lastFrameTime = now;

          if (Math.abs(zoomVelocity) < 0.01) {
            controller.enableInputs = true;
            gestureState.momentumRequestId = null;
            return;
          }

          const dy = zoomVelocity * dt;
          const height = viewer.camera.positionCartographic.height;
          const zoomFactor = height * 0.003;
          viewer.camera.zoomIn(dy * zoomFactor);

          zoomVelocity *= ZOOM_VELOCITY_FRICTION_FACTOR;

          gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
        };
        gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
      } else {
        controller.enableInputs = true;
      }
    } else {
      hasActiveSingleTouchGesture = false;
      controller.enableInputs = true;
    }

    inertiaResetTimeoutId = window.setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      inertiaResetTimeoutId = null;
    }, RESET_INERTIA_TIMEOUT_MS);
  };

  return {
    handleTouchStart,
    handleDrag,
    handleTouchEnd,
  };
}

function findTouchByIdentifier(touchList: TouchList, identifier: number): Touch | undefined {
  for (let i = 0; i < touchList.length; i += 1) {
    const touch = touchList.item(i);
    if (touch?.identifier === identifier) return touch;
  }
  return undefined;
}

function getCanvasTouchPosition(
  canvas: HTMLCanvasElement,
  touch: Touch,
  result: Cesium.Cartesian2,
): Cesium.Cartesian2 {
  const rect = canvas.getBoundingClientRect();
  result.x = touch.clientX - rect.left;
  result.y = touch.clientY - rect.top;
  return result;
}
