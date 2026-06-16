/**
 * Creates touch handlers for double-tap zoom and double-tap drag zoom.
 */

import * as Cesium from "cesium";
import type { InteractionGestureState } from "../state/interactionGestureState";

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
  let lastMoveTime = 0;
  let zoomVelocity = 0;
  let totalMovementLength = 0;
  let isDuringTheSecondTap = false;
  let hasMovedDuringTheSecondTap = false;
  let inertiaResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let revertHasJustMovedTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let revertHasJustDoubleTappedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const handleTouchStart = () => {
    const now = Date.now();
    totalMovementLength = 0;
    hasMovedDuringTheSecondTap = false;
    gestureState.isDuringTheTap = true;

    if (gestureState.momentumRequestId) {
      cancelAnimationFrame(gestureState.momentumRequestId);
      gestureState.momentumRequestId = null;
    }

    if (inertiaResetTimeoutId) {
      clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }

    if (gestureState.pendingSingleTapTime !== null && now - gestureState.pendingSingleTapTime < doubleTapThreshold) {
      isDuringTheSecondTap = true;
      gestureState.pendingSingleTapTime = null;
      gestureState.hasJustDoubleTapped = true;
      controller.enableInputs = false;

      if (revertHasJustDoubleTappedTimeoutId) {
        clearTimeout(revertHasJustDoubleTappedTimeoutId);
        revertHasJustDoubleTappedTimeoutId = null;
      }
      revertHasJustDoubleTappedTimeoutId = setTimeout(() => gestureState.hasJustDoubleTapped = false, doubleTapThreshold * 2);
    } else {
      isDuringTheSecondTap = false;
      gestureState.pendingSingleTapTime = now;
      gestureState.hasJustDoubleTapped = false;
      controller.enableInputs = true;
    }
  };

  const handleDrag = (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    const now = Date.now();
    const dt = now - lastMoveTime;
    const dx = event.endPosition.x - event.startPosition.x;
    const dy = event.endPosition.y - event.startPosition.y;
    lastMoveTime = now;

    const movement = Math.sqrt(dx * dx + dy * dy);
    totalMovementLength += movement;

    if (totalMovementLength > 4) gestureState.hasJustMoved = true;
    if (revertHasJustMovedTimeoutId) {
      clearTimeout(revertHasJustMovedTimeoutId);
      revertHasJustMovedTimeoutId = null;
    }
    revertHasJustMovedTimeoutId = setTimeout(() => gestureState.hasJustMoved = false, doubleTapThreshold);

    if (isDuringTheSecondTap) {
      if (totalMovementLength > 4) hasMovedDuringTheSecondTap = true;

      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;

      if (dt > 0) {
        const currentVelocity = dy / dt;
        zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
      }

      const height = viewer.camera.positionCartographic.height;
      const zoomFactor = height * 0.003;
      viewer.camera.zoomIn(dy * zoomFactor);
    }
  };

  const handleTouchEnd = (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    gestureState.isDuringTheTap = false;

    if (isDuringTheSecondTap) {
      isDuringTheSecondTap = false;

      if (!hasMovedDuringTheSecondTap) {
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const targetHeight = height * 0.5;
        const destination = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
        if (destination) {
          const cartographic = Cesium.Cartographic.fromCartesian(destination);
          cartographic.height = targetHeight;
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

          zoomVelocity *= 0.84;

          gestureState.momentumRequestId = requestAnimationFrame(animateMomentum);
        };
        gestureState.momentumRequestId = requestAnimationFrame(animateMomentum);
      } else {
        controller.enableInputs = true;
      }
    } else {
      controller.enableInputs = true;
    }

    inertiaResetTimeoutId = setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      inertiaResetTimeoutId = null;
    }, 1500);
  };

  return {
    handleTouchStart,
    handleDrag,
    handleTouchEnd,
  };
}
