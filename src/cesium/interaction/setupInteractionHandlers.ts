import * as Cesium from "cesium";
import { ScreenSpaceEventType } from "cesium";
import type { LayerManager } from "../../managers/layerManager";
import type { PortalEntityManager } from "../../managers/portalEntityManager";
import type { PortalHistoryEntityManager } from "../../managers/portalHistoryEntityManager";
import type { ScoutHistoryEntityManager } from "../../managers/scoutHistoryEntityManager";
import type { PortalDetailPaneUI } from "../../interface/PortalDetailPaneUI";
import type { PortalDetailState } from "../../core/coreUi";
import { panCameraByOrbitingGlobe, zoomCameraAroundGlobePoint } from "./cameraGestures";
import { handlePortalSelection } from "./portalSelection";
import type { PortalSelectionState } from "./portalSelection";

const DOUBLE_TAP_THRESHOLD = 300; // ms

export function setupInteractionHandlers(
  viewer: Cesium.Viewer,
  container: HTMLElement,
  portalDetailUI: PortalDetailPaneUI,
  layerManager: LayerManager,
  portalEntityManager: PortalEntityManager,
  portalHistoryEntityManager: PortalHistoryEntityManager,
  scoutHistoryEntityManager: ScoutHistoryEntityManager,
  state: PortalDetailState,
): void {
  const handler = viewer.screenSpaceEventHandler;
  const controller = viewer.scene.screenSpaceCameraController;

  let lastTapTime = 0;
  let lastMoveTime = 0;
  let lastPinchMoveTime = 0;
  let zoomVelocity = 0;
  let pinchZoomVelocity = 0;

  // Variable for remembering the zoom center location
  let lastPinchCenter: Cesium.Cartesian3 | null = null;

  // Variable for triggering the double tap and drag to zoom
  let totalMovementLength: number = 0;

  // Variables for the double tap and drag gesture
  let isDuringTheTap = false;
  let isDuringTheSecondTap = false;
  let hasMovedDuringTheSecondTap = false;
  let momentumRequestId: number | null = null;
  let inertiaResetTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const portalSelectionState: PortalSelectionState = {
    isPortalDetailLoading: false,
    hasCancelledDisplayPortalDetail: false,
  };

  // Variables for detecting double tap
  let hasJustDoubleTapped = false;
  let revertHasJustDoubleTappedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Variable for detecting pinch gesture
  let isPinching = false;
  let hasJustPinched = false;
  let revertHasJustPinchedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Remove default callbacks
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  // Touch start callback
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const now = Date.now();
    totalMovementLength = 0;
    hasMovedDuringTheSecondTap = false;
    isDuringTheTap = true;

    // Cancel all existing momentum when touch start
    if (momentumRequestId) {
      cancelAnimationFrame(momentumRequestId);
      momentumRequestId = null;
    }

    // Cancel resetting the default inertia
    if (inertiaResetTimeoutId) {
      clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }

    // Set variables depends on whether it's double tap
    if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
      isDuringTheSecondTap = true;
      hasJustDoubleTapped = true;
      controller.enableInputs = false;  // Disable default interactions
      lastTapTime = 0;  // Reset to avoid triple tap triggering it again

      // Revert hasJustDoubleTapped after a while
      if (revertHasJustDoubleTappedTimeoutId) { clearTimeout(revertHasJustDoubleTappedTimeoutId); revertHasJustDoubleTappedTimeoutId = null; }
      revertHasJustDoubleTappedTimeoutId = setTimeout(() => hasJustDoubleTapped = false, DOUBLE_TAP_THRESHOLD * 2);
    } else {
      isDuringTheSecondTap = false;
      hasJustDoubleTapped = false;
      controller.enableInputs = true;
      lastTapTime = now;
    }

    handlePortalSelection({
      viewer,
      container,
      portalDetailUI,
      layerManager,
      portalEntityManager,
      portalHistoryEntityManager,
      scoutHistoryEntityManager,
      state,
      selectionState: portalSelectionState,
      gestureState: {
        get hasJustDoubleTapped() { return hasJustDoubleTapped; },
        get isDuringTheTap() { return isDuringTheTap; },
        get hasJustPinched() { return hasJustPinched; },
        get isPinching() { return isPinching; },
        get lastTapTime() { return lastTapTime; },
      },
      doubleTapThreshold: DOUBLE_TAP_THRESHOLD,
      position: event.position,
    });
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // Drag callbacks
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!isDuringTheSecondTap) return;

    const now = Date.now();
    const dt = now - lastMoveTime;
    const dx = event.endPosition.x - event.startPosition.x;
    const dy = event.endPosition.y - event.startPosition.y;
    lastMoveTime = now;

    const movement = Math.sqrt(dx * dx + dy * dy);
    totalMovementLength  += movement;
    if (totalMovementLength > 4) hasMovedDuringTheSecondTap = true;

    // Disable momentum from default camera controller temporarily
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;

    // Calculate and smooth velocity (pixels per ms)
    if (dt > 0) {
      const currentVelocity = dy / dt;
      zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
    }

    // Zoom from the center of the canvas
    const height = viewer.camera.positionCartographic.height;
    const zoomFactor = height * 0.003;
    viewer.camera.zoomIn(dy * zoomFactor);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Touch end callback
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    isDuringTheTap = false;

    if (isDuringTheSecondTap) {
      // Second tap ended
      isDuringTheSecondTap = false;

      if (!hasMovedDuringTheSecondTap) {
        // Double tap without dragging: animated zoom in
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
        // Apply momentum if velocity is significant
        let lastFrameTime = Date.now();
        const animateMomentum = () => {
          const now = Date.now();
          const dt = now - lastFrameTime;
          lastFrameTime = now;

          if (Math.abs(zoomVelocity) < 0.01) {
            controller.enableInputs = true;
            momentumRequestId = null;
            return;
          }

          const dy = zoomVelocity * dt;
          const height = viewer.camera.positionCartographic.height;
          const zoomFactor = height * 0.003;
          viewer.camera.zoomIn(dy * zoomFactor);

          // Decelerate
          zoomVelocity *= 0.84;

          momentumRequestId = requestAnimationFrame(animateMomentum);
        };
        momentumRequestId = requestAnimationFrame(animateMomentum);
      } else {
        // Dragged but no significant momentum
        controller.enableInputs = true;
      }
    } else {
      // Single tap ended
      controller.enableInputs = true;
    }

    // Restore move momentum after a while
    inertiaResetTimeoutId = setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;       // Cesium's default
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;  // Cesium's default
      inertiaResetTimeoutId = null;
    }, 1500);
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  // Pinch related settings below
  const camera = viewer.camera;

  let pinchMode: "zoom" | "rotate" | "tilt" = "zoom";
  let totalZoomDelta = 0;
  let totalAngleDelta = 0;
  let totalHeightDelta = 0;

  const ZOOM_THRESHOLD = 6.0;     // pixels
  const ROTATE_THRESHOLD = 0.1;   // radians
  const TILT_THRESHOLD = 4.0;     // relative height delta
  const MIN_PITCH = Cesium.Math.toRadians(-90);
  const MAX_PITCH = Cesium.Math.toRadians(-60);

  // Pinch start callback
  handler.setInputAction(() => {
    isPinching = true;
    pinchMode = "zoom";
    totalZoomDelta = 0;
    totalAngleDelta = 0;
    totalHeightDelta = 0;
    pinchZoomVelocity = 0;
    lastPinchMoveTime = Date.now();

    // Cancel all existing momentum when pinch start
    if (momentumRequestId) {
      cancelAnimationFrame(momentumRequestId);
      momentumRequestId = null;
    }
  }, ScreenSpaceEventType.PINCH_START);

  // Pinch move callback - handles rotation and tilting
  // @ts-expect-error - Cesium type definitions are incorrect
  handler.setInputAction((event: {
    distance: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
    angleAndHeight: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
  }) => {
    // We need the internal handler to get the absolute positions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlerInternal = handler as any;
    const positions = handlerInternal._positions;
    const previousPositions = handlerInternal._previousPositions;
    const position1 = positions.values[0];
    const position2 = positions.values[1];
    const previousPosition1 = previousPositions.values[0];
    const previousPosition2 = previousPositions.values[1];

    // Calculate the center of the two fingers now and previously
    const avgPosition = new Cesium.Cartesian2(
      (position1.x + position2.x) / 2,
      (position1.y + position2.y) / 2
    );

    const previousAvgPosition = new Cesium.Cartesian2(
      (previousPosition1.x + previousPosition2.x) / 2,
      (previousPosition1.y + previousPosition2.y) / 2
    );

    // Calculate the midpoint we need to rotate
    const centerPosition = new Cesium.Cartesian2(
      (avgPosition.x + previousAvgPosition.x) / 2,
      (avgPosition.y + previousAvgPosition.y) / 2
    );

    // Calculate deltas
    const zoomDelta = event.distance.endPosition.y - event.distance.startPosition.y;
    let angleDelta = event.angleAndHeight.endPosition.x - event.angleAndHeight.startPosition.x;
    const heightDelta = event.angleAndHeight.endPosition.y - event.angleAndHeight.startPosition.y;

    // Clip angleDelta between -PI and PI
    if (angleDelta > Math.PI) {
      angleDelta -= 2 * Math.PI;
    } else if (angleDelta < -Math.PI) {
      angleDelta += 2 * Math.PI;
    }

    totalZoomDelta += Math.abs(zoomDelta);    // UX optimization, calculates the absolute total
    totalAngleDelta += angleDelta;
    totalHeightDelta += heightDelta;

    if (pinchMode === "zoom") {
      if (totalZoomDelta > ZOOM_THRESHOLD) {  // Locked to zoom here, thus zoom threshold should be a little higher than tilt threshold
        pinchMode = "zoom";
      } else if (Math.abs(totalHeightDelta) > TILT_THRESHOLD) {
        pinchMode = "tilt";
      } else if (Math.abs(totalAngleDelta) > ROTATE_THRESHOLD) {
        pinchMode = "rotate";
      }
    }

    if (pinchMode === "zoom" || pinchMode === "rotate") {
      const center = camera.pickEllipsoid(centerPosition, viewer.scene.globe.ellipsoid);

      if (center) {
        lastPinchCenter = center;

        // Pan to follow midpoint movement dynamically
        const dx = avgPosition.x - previousAvgPosition.x;
        const dy = avgPosition.y - previousAvgPosition.y;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          panCameraByOrbitingGlobe(camera, viewer.scene.globe.ellipsoid, previousAvgPosition, avgPosition);
        }

        // Zoom
        const currentDistance = Cesium.Cartesian2.distance(position1, position2);
        const previousDistance = Cesium.Cartesian2.distance(previousPosition1, previousPosition2);
        const distanceDelta = currentDistance - previousDistance;

        if (Math.abs(distanceDelta) > 0) {
          const now = Date.now();
          const dt = now - lastPinchMoveTime;
          lastPinchMoveTime = now;

          if (dt > 0) {
            const currentVelocity = distanceDelta / dt;
            pinchZoomVelocity = pinchZoomVelocity * 0.4 + currentVelocity * 0.6;
          }

          const height = camera.positionCartographic.height;
          const zoomFactor = height * 0.003;
          zoomCameraAroundGlobePoint(camera, center, distanceDelta * zoomFactor);
        }

        // Rotate
        if (pinchMode === "rotate") {
          const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          camera.lookAtTransform(transform);
          camera.rotateRight(angleDelta * 0.6);
          camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
      }
    }

    if (pinchMode === "tilt") {
      const tiltAmount = heightDelta * 0.02;
      const currentPitch = camera.pitch;

      // Cesium pitch: 0 is horizontal (looking at the horizon), -90 is looking down (-PI/2).
      // Constraint: -90 to -60 degrees from horizontal (30 degrees from vertical).

      let actualTiltAmount = tiltAmount;
      const targetPitch = currentPitch - tiltAmount; // rotateDown(tiltAmount) decreases pitch
      if (targetPitch > MAX_PITCH) {
        actualTiltAmount = currentPitch - MAX_PITCH;
      } else if (targetPitch < MIN_PITCH) {
        actualTiltAmount = currentPitch - MIN_PITCH;
      }

      if (Math.abs(actualTiltAmount) > 0) {
        const canvas = viewer.scene.canvas;
        const center = camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), viewer.scene.globe.ellipsoid);

        if (center) {
          const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          camera.lookAtTransform(transform);
          camera.rotateDown(actualTiltAmount);
          camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
      }
    }
  }, ScreenSpaceEventType.PINCH_MOVE);

  // Pinch end callback
  handler.setInputAction(() => {
    isPinching = false;
    hasJustPinched = true;
    if (revertHasJustPinchedTimeoutId) clearTimeout(revertHasJustPinchedTimeoutId);
    revertHasJustPinchedTimeoutId = setTimeout(() => hasJustPinched = false, DOUBLE_TAP_THRESHOLD);

    if (Math.abs(pinchZoomVelocity) > 0.1 && (pinchMode === "zoom" || pinchMode == "rotate")) {
      // Cap the pinchZoomVelocity
      if (pinchZoomVelocity > 5) pinchZoomVelocity = 5;
      if (pinchZoomVelocity < -5) pinchZoomVelocity = -5;

      // Apply momentum if velocity is significant
      let lastFrameTime = Date.now();
      let avgDt = 16; // Start with 60fps estimate
      const animateMomentum = () => {
        const now = Date.now();
        const dt = now - lastFrameTime;
        lastFrameTime = now;

        // Smooth dt to prevent spikes from lost frames,
        avgDt = avgDt * 0.8 + Math.min(dt, 80) * 0.2;  // Cap to 80ms in the calculation
        const effectiveDt = avgDt;

        if (Math.abs(pinchZoomVelocity) < 0.01) {
          controller.enableInputs = true;
          momentumRequestId = null;
          return;
        }

        const distanceDelta = pinchZoomVelocity * effectiveDt;
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const zoomFactor = height * 0.003;

        if (lastPinchCenter) {
          zoomCameraAroundGlobePoint(camera, lastPinchCenter, distanceDelta * zoomFactor);
        }

        // Decelerate
        pinchZoomVelocity *= 0.64;

        momentumRequestId = requestAnimationFrame(animateMomentum);
      };
      momentumRequestId = requestAnimationFrame(animateMomentum);
    }
  }, ScreenSpaceEventType.PINCH_END);
}
