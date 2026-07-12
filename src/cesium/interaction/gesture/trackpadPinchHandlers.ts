/**
 * Adapts trackpad pinch-wheel events into cursor-anchored Cesium zoom gestures.
 */

import * as Cesium from "cesium";
import {
  createGestureSurfacePicker,
  pickGestureSurfacePosition,
  zoomCameraAlongViewDirection,
  zoomCameraAroundGlobePoint,
} from "../camera/cameraGestures.ts";
import type { InteractionGestureState } from "../state/interactionGestureState.ts";

const ZOOM_FACTOR = 0.005;
const GESTURE_END_DELAY = 100;

export function createTrackpadPinchHandlers(
  viewer: Cesium.Viewer,
  controller: Cesium.ScreenSpaceCameraController,
  gestureState: InteractionGestureState,
) {
  const canvas = viewer.scene.canvas;
  const gestureSurfacePicker = createGestureSurfacePicker(viewer.scene);
  const pinchPosition = new Cesium.Cartesian2();

  let queuedDelta = 0;
  let pinchFrameRequestId: number | null = null;
  let gestureEndTimeoutId: number | null = null;

  const applyQueuedPinchFrame = () => {
    pinchFrameRequestId = null;

    const delta = queuedDelta;
    queuedDelta = 0;
    if (delta === 0) return;

    const camera = viewer.camera;
    const center = pickGestureSurfacePosition(viewer.scene, pinchPosition, gestureSurfacePicker);
    const amount = -delta * camera.positionCartographic.height * ZOOM_FACTOR;

    if (center) {
      zoomCameraAroundGlobePoint(camera, center, amount);
    } else {
      zoomCameraAlongViewDirection(camera, amount);
    }
  };

  const handleWheel = (event: WheelEvent) => {
    // Browsers expose trackpad pinch as a synthetic wheel event with Ctrl set.
    // Leave ordinary wheel events for Cesium's existing scroll-to-zoom handler.
    if (!event.ctrlKey) return;

    event.preventDefault();

    if (gestureState.momentumRequestId !== null) {
      window.cancelAnimationFrame(gestureState.momentumRequestId);
      gestureState.momentumRequestId = null;
      controller.enableInputs = true;
    }

    const rect = canvas.getBoundingClientRect();
    pinchPosition.x = event.clientX - rect.left;
    pinchPosition.y = event.clientY - rect.top;

    const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 40
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? canvas.clientHeight
        : 1;
    queuedDelta += event.deltaY * deltaScale;

    if (pinchFrameRequestId === null) {
      pinchFrameRequestId = window.requestAnimationFrame(applyQueuedPinchFrame);
    }

    if (gestureEndTimeoutId !== null) window.clearTimeout(gestureEndTimeoutId);
    gestureEndTimeoutId = window.setTimeout(() => {
      gestureEndTimeoutId = null;
      gestureSurfacePicker.reset();
    }, GESTURE_END_DELAY);
  };

  return { handleWheel };
}
