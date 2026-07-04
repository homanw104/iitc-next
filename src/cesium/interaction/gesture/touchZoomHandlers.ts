/**
 * Creates touch and mouse handlers for surface pan, double-tap zoom, and double-tap drag zoom.
 *
 * Handler naming follows the event layer that calls each function:
 *
 * - handle... functions are the public Cesium ScreenSpaceEventHandler callbacks returned
 *   to setUpInteractionHandlers. They advance the high-level gesture lifecycle in the same
 *   LEFT_DOWN -> MOUSE_MOVE -> LEFT_UP order as Cesium's camera controller.
 * - handleNative... functions are raw DOM touch listeners bound to the canvas. Cesium's
 *   abstraction does not expose touch identifiers or touch counts, so these listeners track
 *   the active finger and feed exact touch positions into the shared drag logic.
 * - handleMouse... functions are raw DOM mouse/pointer listeners. They only record whether
 *   an unmodified left-button mouse gesture started on the canvas, and they catch release or
 *   cancel events on "window" so dragging outside the canvas cannot leave the mouse state stuck.
 *
 * The raw DOM listeners do not stop propagation or prevent default behavior. They collect the
 * browser-level details Cesium does not expose, while the returned Cesium handlers decide when
 * to perform custom terrain/tile-aware camera movement.
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
const PAN_VELOCITY_FRICTION_FACTOR = 0.92;
const PAN_MOMENTUM_STOP_VELOCITY_PIXELS_PER_MS = 0.02;
const MAX_MOMENTUM_FRAME_TIME_MS = 50;
const RESET_INERTIA_TIMEOUT_MS = 1500;
const MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS = 5;
const TOUCH_EVENT_OPTIONS: AddEventListenerOptions = { passive: true };
const MOUSE_DOWN_EVENT_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
const MOUSE_UP_EVENT_OPTIONS: AddEventListenerOptions = { passive: true };

type ZoomSurfacePick = {
  position: Cesium.Cartesian3;
  hasSurfaceHeight: boolean;
};

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
  const canvas = viewer.scene.canvas;
  const pendingDragStartPosition = new Cesium.Cartesian2();
  const pendingDragEndPosition = new Cesium.Cartesian2();
  const lastTouchPosition = new Cesium.Cartesian2();
  const currentTouchPosition = new Cesium.Cartesian2();
  const mouseEndPosition = new Cesium.Cartesian2();
  const panVelocity = new Cesium.Cartesian2();
  const panMomentumPosition = new Cesium.Cartesian2();
  const panMomentumEndPosition = new Cesium.Cartesian2();
  const zoomRenderedPosition = new Cesium.Cartesian3();
  const zoomTerrainPosition = new Cesium.Cartesian3();
  const zoomEllipsoidPosition = new Cesium.Cartesian3();
  const zoomPickRay = new Cesium.Ray();

  let lastMoveTime = 0;
  let zoomVelocity = 0;
  let totalMovementLength = 0;
  let pendingDragEventTime = 0;
  let activeTouchCount = 0;
  let trackedTouchIdentifier: number | null = null;
  let hasLastTouchPosition = false;
  let hasActiveSingleTouchGesture = false;
  let isDuringTheSecondTap = false;
  let hasMovedDuringTheSecondTap = false;
  let hasCancelledPortalSelectionForDrag = false;
  let isSingleTouchPanning = false;
  let isMouseLeftDown = false;
  let hasActiveMouseGesture = false;
  let isMousePanning = false;
  let hasPendingDragFrame = false;
  let dragFrameRequestId: number | null = null;
  let inertiaResetTimeoutId: number | null = null;
  let revertHasJustMovedTimeoutId: number | null = null;
  let revertHasJustDoubleTappedTimeoutId: number | null = null;
  let removeEnableInputsPostRenderListener: Cesium.Event.RemoveCallback | null = null;

  const handleTouchStart = () => {
    const now = Date.now();
    lastMoveTime = now;
    zoomVelocity = 0;
    resetPanVelocity();
    totalMovementLength = 0;
    hasMovedDuringTheSecondTap = false;
    hasCancelledPortalSelectionForDrag = false;
    gestureState.isDuringTheTap = true;
    gestureSurfacePicker.reset();

    if (gestureState.momentumRequestId) {
      window.cancelAnimationFrame(gestureState.momentumRequestId);
      gestureState.momentumRequestId = null;
    }

    cancelScheduledInputReEnable();

    if (inertiaResetTimeoutId) {
      window.clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }

    if (gestureState.pendingSingleTapTime !== null && now - gestureState.pendingSingleTapTime < doubleTapThreshold) {
      isDuringTheSecondTap = true;
      gestureState.pendingSingleTapTime = null;
      gestureState.hasJustDoubleTapped = true;
      gestureState.portalSelectionCancellationVersion += 1;
      controller.enableInputs = false;

      if (revertHasJustDoubleTappedTimeoutId) {
        window.clearTimeout(revertHasJustDoubleTappedTimeoutId);
        revertHasJustDoubleTappedTimeoutId = null;
      }
      revertHasJustDoubleTappedTimeoutId = window.setTimeout(
        () => gestureState.hasJustDoubleTapped = false,
        doubleTapThreshold * 2,
      );
    } else {
      isDuringTheSecondTap = false;
      gestureState.pendingSingleTapTime = now;
      gestureState.hasJustDoubleTapped = false;
      controller.enableInputs = activeTouchCount !== 1 && !hasActiveMouseGesture;
    }
  };

  const handleDrag = (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (activeTouchCount > 0) return;
    if (!isMouseLeftDown || !hasActiveMouseGesture) return;

    handleDragPositions(event.startPosition, event.endPosition, Date.now());
  };

  const handleTouchEnd = (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    gestureState.isDuringTheTap = false;
    trackedTouchIdentifier = null;
    hasLastTouchPosition = false;
    isMouseLeftDown = false;

    if (dragFrameRequestId !== null) {
      window.cancelAnimationFrame(dragFrameRequestId);
      dragFrameRequestId = null;
      applyQueuedDragFrame();
    }

    if (isSingleTouchPanning || isMousePanning) {
      isSingleTouchPanning = false;
      isMousePanning = false;
      resetTouchTracking();
      resetMouseTracking();
      startPanMomentum();
    } else if (isDuringTheSecondTap) {
      gestureSurfacePicker.reset();
      isDuringTheSecondTap = false;
      resetTouchTracking();
      resetMouseTracking();

      if (!hasMovedDuringTheSecondTap) {
        zoomInAroundTap(event.position);
      } else if (Math.abs(zoomVelocity) > 0.1) {
        startZoomMomentum();
      } else {
        controller.enableInputs = true;
      }
    } else {
      gestureSurfacePicker.reset();
      resetTouchTracking();
      resetMouseTracking();
      controller.enableInputs = true;
    }

    scheduleCesiumPanInertiaReset();
  };

  const handleNativeTouchStart = (event: TouchEvent) => {
    activeTouchCount = event.touches.length;
    gestureSurfacePicker.reset();
    cancelScheduledInputReEnable();
    if (activeTouchCount === 1) {
      const touch = event.touches[0];
      trackedTouchIdentifier = touch.identifier;
      getCanvasTouchPosition(canvas, touch, lastTouchPosition);
      hasLastTouchPosition = true;
      hasActiveSingleTouchGesture = true;
      controller.enableInputs = false;
    } else {
      cancelQueuedDragFrame();
      resetTouchTracking();
      resetMouseTracking();
      isSingleTouchPanning = false;
      isMousePanning = false;
      resetPanVelocity();
      controller.enableInputs = true;
    }
  };

  const handleNativeTouchMove = (event: TouchEvent) => {
    activeTouchCount = event.touches.length;
    if (activeTouchCount !== 1 || trackedTouchIdentifier === null) return;

    const touch = findTouchByIdentifier(event.touches, trackedTouchIdentifier);
    if (!touch) return;

    getCanvasTouchPosition(canvas, touch, currentTouchPosition);
    if (!hasLastTouchPosition) {
      Cesium.Cartesian2.clone(currentTouchPosition, lastTouchPosition);
      hasLastTouchPosition = true;
      return;
    }

    handleDragPositions(lastTouchPosition, currentTouchPosition, Date.now());
    Cesium.Cartesian2.clone(currentTouchPosition, lastTouchPosition);
  };

  const handleNativeTouchEnd = (event: TouchEvent) => {
    activeTouchCount = event.touches.length;
    if (trackedTouchIdentifier !== null && findTouchByIdentifier(event.changedTouches, trackedTouchIdentifier)) {
      trackedTouchIdentifier = null;
      hasLastTouchPosition = false;
    }
  };

  const handleNativeTouchCancel = (event: TouchEvent) => {
    activeTouchCount = event.touches.length;
    if (trackedTouchIdentifier !== null && findTouchByIdentifier(event.changedTouches, trackedTouchIdentifier)) {
      resetTouchTracking();
    }
    gestureSurfacePicker.reset();
    if (activeTouchCount === 0) {
      cancelQueuedDragFrame();
      isSingleTouchPanning = false;
      resetPanVelocity();
      enableInputsAfterCesiumInputReset();
      scheduleCesiumPanInertiaReset();
    }
  };

  const handleMouseDown = (event: MouseEvent | PointerEvent) => {
    if (!isPlainLeftMouseButtonEvent(event)) return;

    isMouseLeftDown = true;
    hasActiveMouseGesture = true;
    getCanvasMousePosition(canvas, event, mouseEndPosition);
  };

  const handleMouseUp = (event: MouseEvent | PointerEvent) => {
    if (!hasActiveMouseGesture || !isLeftMouseButtonEvent(event)) return;

    getCanvasMousePosition(canvas, event, mouseEndPosition);
    handleTouchEnd({ position: mouseEndPosition });
  };

  const handleMouseCancel = (event: PointerEvent) => {
    if (!hasActiveMouseGesture || event.pointerType !== "mouse") return;

    getCanvasMousePosition(canvas, event, mouseEndPosition);
    handleTouchEnd({ position: mouseEndPosition });
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

    if (totalMovementLength > DRAG_THRESHOLD_PIXELS) {
      gestureState.hasJustMoved = true;
      if (!hasCancelledPortalSelectionForDrag) {
        gestureState.portalSelectionCancellationVersion += 1;
        hasCancelledPortalSelectionForDrag = true;
      }
    }
    if (revertHasJustMovedTimeoutId) {
      window.clearTimeout(revertHasJustMovedTimeoutId);
      revertHasJustMovedTimeoutId = null;
    }
    revertHasJustMovedTimeoutId = window.setTimeout(
      () => gestureState.hasJustMoved = false,
      doubleTapThreshold,
    );

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
    const dx = pendingDragEndPosition.x - pendingDragStartPosition.x;
    const dy = pendingDragEndPosition.y - pendingDragStartPosition.y;
    lastMoveTime = pendingDragEventTime;

    if (isDuringTheSecondTap) {
      if (totalMovementLength > DOUBLE_TAP_AND_DRAG_ZOOM_THRESHOLD_PIXELS) hasMovedDuringTheSecondTap = true;

      disableCesiumPanInertia();

      if (dt > 0) {
        const currentVelocity = dy / dt;
        zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
      }

      const height = viewer.camera.positionCartographic.height;
      const zoomFactor = height * 0.003;
      viewer.camera.zoomIn(dy * zoomFactor);
    } else if (
      (hasActiveSingleTouchGesture || hasActiveMouseGesture) &&
      totalMovementLength > DRAG_THRESHOLD_PIXELS
    ) {
      isSingleTouchPanning = hasActiveSingleTouchGesture;
      isMousePanning = hasActiveMouseGesture;
      controller.enableInputs = false;
      disableCesiumPanInertia();
      if (dt > 0) {
        panVelocity.x = panVelocity.x * 0.4 + (dx / dt) * 0.6;
        panVelocity.y = panVelocity.y * 0.4 + (dy / dt) * 0.6;
      }
      panCameraByOrbitingSurface(
        viewer.scene,
        pendingDragStartPosition,
        pendingDragEndPosition,
        gestureSurfacePicker,
      );
    }
  };

  const startPanMomentum = () => {
    if (getPanVelocityMagnitude() < PAN_MOMENTUM_STOP_VELOCITY_PIXELS_PER_MS) {
      gestureSurfacePicker.reset();
      resetPanVelocity();
      enableInputsAfterCesiumInputReset();
      return;
    }

    Cesium.Cartesian2.clone(pendingDragEndPosition, panMomentumPosition);
    let lastFrameTime = Date.now();
    const animateMomentum = () => {
      const now = Date.now();
      const dt = Math.min(now - lastFrameTime, MAX_MOMENTUM_FRAME_TIME_MS);
      lastFrameTime = now;

      if (getPanVelocityMagnitude() < PAN_MOMENTUM_STOP_VELOCITY_PIXELS_PER_MS) {
        gestureSurfacePicker.reset();
        resetPanVelocity();
        enableInputsAfterCesiumInputReset();
        gestureState.momentumRequestId = null;
        return;
      }

      panMomentumEndPosition.x = panMomentumPosition.x + panVelocity.x * dt;
      panMomentumEndPosition.y = panMomentumPosition.y + panVelocity.y * dt;
      panCameraByOrbitingSurface(
        viewer.scene,
        panMomentumPosition,
        panMomentumEndPosition,
        gestureSurfacePicker,
      );
      Cesium.Cartesian2.clone(panMomentumEndPosition, panMomentumPosition);

      const frameDecay = Math.pow(PAN_VELOCITY_FRICTION_FACTOR, dt / 16.67);
      panVelocity.x *= frameDecay;
      panVelocity.y *= frameDecay;

      gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
    };
    gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
  };

  const startZoomMomentum = () => {
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
  };

  const zoomInAroundTap = (position: Cesium.Cartesian2) => {
    const surfacePick = pickZoomSurfacePosition(position);
    if (!surfacePick) {
      controller.enableInputs = true;
      return;
    }

    const cartographic = Cesium.Cartographic.fromCartesian(surfacePick.position);
    const surfaceHeight = getZoomSurfaceHeight(cartographic, surfacePick.hasSurfaceHeight);
    const cameraHeight = viewer.camera.positionCartographic.height;
    const targetHeight = surfaceHeight + (cameraHeight - surfaceHeight) * 0.5;
    cartographic.height = Math.max(targetHeight, surfaceHeight + MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS);
    viewer.camera.flyTo({
      destination: Cesium.Cartographic.toCartesian(cartographic),
      duration: 0.5,
      complete: () => {
        controller.enableInputs = true;
      },
    });
  };

  const pickZoomSurfacePosition = (position: Cesium.Cartesian2): ZoomSurfacePick | undefined => {
    const renderedPosition = pickRenderedSurfacePosition(position);
    if (renderedPosition) return { position: renderedPosition, hasSurfaceHeight: true };

    const ray = viewer.camera.getPickRay(position, zoomPickRay);
    const terrainPosition = ray && viewer.scene.globe.show
      ? viewer.scene.globe.pick(ray, viewer.scene, zoomTerrainPosition)
      : undefined;
    if (terrainPosition) return { position: terrainPosition, hasSurfaceHeight: true };

    const ellipsoidPosition = viewer.camera.pickEllipsoid(
      position,
      viewer.scene.globe.ellipsoid,
      zoomEllipsoidPosition,
    );
    if (ellipsoidPosition) return { position: ellipsoidPosition, hasSurfaceHeight: false };

    return undefined;
  };

  const pickRenderedSurfacePosition = (position: Cesium.Cartesian2) => {
    if (!viewer.scene.pickPositionSupported) return undefined;

    try {
      return viewer.scene.pickPosition(position, zoomRenderedPosition);
    } catch {
      return undefined;
    }
  };

  const getZoomSurfaceHeight = (
    cartographic: Cesium.Cartographic,
    hasSurfaceHeight: boolean,
  ) => {
    if (hasSurfaceHeight) return cartographic.height;

    return viewer.scene.sampleHeightSupported
      ? viewer.scene.sampleHeight(cartographic) ?? cartographic.height
      : cartographic.height;
  };

  const resetTouchTracking = () => {
    trackedTouchIdentifier = null;
    hasLastTouchPosition = false;
    hasActiveSingleTouchGesture = false;
  };

  const resetMouseTracking = () => {
    isMouseLeftDown = false;
    hasActiveMouseGesture = false;
  };

  const resetPanVelocity = () => {
    panVelocity.x = 0;
    panVelocity.y = 0;
  };

  const getPanVelocityMagnitude = () => Math.sqrt(
    panVelocity.x * panVelocity.x + panVelocity.y * panVelocity.y,
  );

  const disableCesiumPanInertia = () => {
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;
  };

  const scheduleCesiumPanInertiaReset = () => {
    if (inertiaResetTimeoutId) {
      window.clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }
    inertiaResetTimeoutId = window.setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      inertiaResetTimeoutId = null;
    }, RESET_INERTIA_TIMEOUT_MS);
  };

  const cancelScheduledInputReEnable = () => {
    if (removeEnableInputsPostRenderListener) {
      removeEnableInputsPostRenderListener();
      removeEnableInputsPostRenderListener = null;
    }
  };

  const enableInputsAfterCesiumInputReset = () => {
    cancelScheduledInputReEnable();
    removeEnableInputsPostRenderListener = viewer.scene.postRender.addEventListener(() => {
      cancelScheduledInputReEnable();
      controller.enableInputs = true;
    });
  };

  const registerNativeEventListeners = () => {
    canvas.addEventListener("touchstart", handleNativeTouchStart, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchmove", handleNativeTouchMove, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchend", handleNativeTouchEnd, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchcancel", handleNativeTouchCancel, TOUCH_EVENT_OPTIONS);

    if (typeof PointerEvent !== "undefined") {
      canvas.addEventListener("pointerdown", handleMouseDown, MOUSE_DOWN_EVENT_OPTIONS);
      window.addEventListener("pointerup", handleMouseUp, MOUSE_UP_EVENT_OPTIONS);
      window.addEventListener("pointercancel", handleMouseCancel, MOUSE_UP_EVENT_OPTIONS);
    } else {
      canvas.addEventListener("mousedown", handleMouseDown, MOUSE_DOWN_EVENT_OPTIONS);
      window.addEventListener("mouseup", handleMouseUp, MOUSE_UP_EVENT_OPTIONS);
    }
  };

  registerNativeEventListeners();

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

function getCanvasMousePosition(
  canvas: HTMLCanvasElement,
  event: MouseEvent | PointerEvent,
  result: Cesium.Cartesian2,
): Cesium.Cartesian2 {
  const rect = canvas.getBoundingClientRect();
  result.x = event.clientX - rect.left;
  result.y = event.clientY - rect.top;
  return result;
}

function isPlainLeftMouseButtonEvent(event: MouseEvent | PointerEvent): boolean {
  return isLeftMouseButtonEvent(event) &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey;
}

function isLeftMouseButtonEvent(event: MouseEvent | PointerEvent): boolean {
  return event.button === 0 && (!("pointerType" in event) || event.pointerType === "mouse");
}
