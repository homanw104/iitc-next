/**
 * Creates Cesium pinch handlers for zoom, pan, rotate, tilt, and momentum.
 */

import * as Cesium from "cesium";
import {
  getCameraPitchRelativeToGlobePoint,
  keepCameraAboveRenderedSurface,
  panCameraByOrbitingGlobe,
  pickRenderedGlobeOrTilePosition,
  zoomCameraAlongViewDirection,
  zoomCameraAroundGlobePoint,
} from "../camera/cameraGestures";
import type { InteractionGestureState } from "../state/interactionGestureState";

// Net two-finger twist needed before leaving pan/zoom for rotation
const ROTATE_PROMOTION_RADIANS = 0.24;

// Net vertical midpoint travel needed before leaving pan/zoom for tilt
const TILT_PROMOTION_CENTER_PIXELS = 18;

// Net pinch-distance change that locks the rest of the gesture to pan/zoom
const ZOOM_LOCK_DISTANCE_PIXELS = 64;

// Reject tilt if horizontal midpoint drift is close to vertical travel
const TILT_HORIZONTAL_REJECTION_RATIO = 1.2;

// Fixed slack for small mismatches between the two finger paths
const TILT_RELATIVE_MOTION_TOLERANCE_PIXELS = 30;

// Extra slack proportional to gesture size for imperfect parallel movement.
const TILT_RELATIVE_MOTION_RATIO = 1.4;

const MIN_PITCH = Cesium.Math.toRadians(-90);
const MAX_PITCH = Cesium.Math.toRadians(0);

type PinchMode = "pending" | "zoom" | "rotate" | "tilt";

interface PinchMoveEvent {
  distance: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
  angleAndHeight: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
}

interface PinchGestureHandlers {
  handlePinchStart: () => void;
  handlePinchMove: (event: PinchMoveEvent) => void;
  handlePinchEnd: () => void;
}

interface PendingPinchGesture {
  currentDistance: number;
  currentAngle: number;
  currentCenter: Cesium.Cartesian2;
  startDistance: number;
  startAngle: number;
  startCenter: Cesium.Cartesian2;
  finger1Start: Cesium.Cartesian2;
  finger2Start: Cesium.Cartesian2;
  finger1Current: Cesium.Cartesian2;
  finger2Current: Cesium.Cartesian2;
}

export function createPinchGestureHandlers(
  viewer: Cesium.Viewer,
  handler: Cesium.ScreenSpaceEventHandler,
  controller: Cesium.ScreenSpaceCameraController,
  gestureState: InteractionGestureState,
  doubleTapThreshold: number,
): PinchGestureHandlers {
  const camera = viewer.camera;

  let pinchMode: PinchMode = "pending";
  let lastPinchMoveTime = 0;
  let pinchZoomVelocity = 0;
  let lastPinchCenter: Cesium.Cartesian3 | null = null;
  let rotationCenter: Cesium.Cartesian3 | null = null;
  let tiltCenter: Cesium.Cartesian3 | null = null;
  let hasPinchStartPositions = false;
  let pinchStartDistance = 0;
  let pinchStartAngle = 0;
  let revertHasJustPinchedTimeoutId: number | null = null;
  const avgPosition = new Cesium.Cartesian2();
  const previousAvgPosition = new Cesium.Cartesian2();
  const centerPosition = new Cesium.Cartesian2();
  const tiltCenterPosition = new Cesium.Cartesian2();
  const pinchStartPosition1 = new Cesium.Cartesian2();
  const pinchStartPosition2 = new Cesium.Cartesian2();
  const pinchStartCenterPosition = new Cesium.Cartesian2();
  const rotationTransform = new Cesium.Matrix4();
  const tiltTransform = new Cesium.Matrix4();

  const handlePinchStart = () => {
    gestureState.isPinching = true;
    pinchMode = "pending";
    pinchZoomVelocity = 0;
    lastPinchCenter = null;
    rotationCenter = null;
    tiltCenter = null;
    hasPinchStartPositions = false;
    pinchStartDistance = 0;
    pinchStartAngle = 0;
    lastPinchMoveTime = Date.now();

    if (gestureState.momentumRequestId) {
      window.cancelAnimationFrame(gestureState.momentumRequestId);
      gestureState.momentumRequestId = null;
    }
  };

  const handlePinchMove = (event: PinchMoveEvent) => {
    // @ts-expect-error - We need to access the handler's internal properties to get the screen positions.
    const handlerInternal = handler as {
      _positions: { values: Cesium.Cartesian2[] };
      _previousPositions: { values: Cesium.Cartesian2[] };
    };
    const positions = handlerInternal._positions;
    const previousPositions = handlerInternal._previousPositions;
    const position1 = positions.values[0];
    const position2 = positions.values[1];
    const previousPosition1 = previousPositions.values[0];
    const previousPosition2 = previousPositions.values[1];

    const currentDistance = Cesium.Cartesian2.distance(position1, position2);
    const previousDistance = Cesium.Cartesian2.distance(previousPosition1, previousPosition2);

    if (!hasPinchStartPositions) {
      Cesium.Cartesian2.clone(previousPosition1, pinchStartPosition1);
      Cesium.Cartesian2.clone(previousPosition2, pinchStartPosition2);
      pinchStartCenterPosition.x = (previousPosition1.x + previousPosition2.x) / 2;
      pinchStartCenterPosition.y = (previousPosition1.y + previousPosition2.y) / 2;
      pinchStartDistance = previousDistance;
      pinchStartAngle = Math.atan2(
        previousPosition2.y - previousPosition1.y,
        previousPosition2.x - previousPosition1.x,
      );
      hasPinchStartPositions = true;
    }

    avgPosition.x = (position1.x + position2.x) / 2;
    avgPosition.y = (position1.y + position2.y) / 2;
    previousAvgPosition.x = (previousPosition1.x + previousPosition2.x) / 2;
    previousAvgPosition.y = (previousPosition1.y + previousPosition2.y) / 2;
    centerPosition.x = (avgPosition.x + previousAvgPosition.x) / 2;
    centerPosition.y = (avgPosition.y + previousAvgPosition.y) / 2;

    let angleDelta = event.angleAndHeight.endPosition.x - event.angleAndHeight.startPosition.x;
    const heightDelta = event.angleAndHeight.endPosition.y - event.angleAndHeight.startPosition.y;

    if (angleDelta > Math.PI) {
      angleDelta -= 2 * Math.PI;
    } else if (angleDelta < -Math.PI) {
      angleDelta += 2 * Math.PI;
    }

    if (pinchMode === "pending") {
      pinchMode = classifyPendingPinchGesture({
        currentDistance,
        currentAngle: Math.atan2(position2.y - position1.y, position2.x - position1.x),
        currentCenter: avgPosition,
        startDistance: pinchStartDistance,
        startAngle: pinchStartAngle,
        startCenter: pinchStartCenterPosition,
        finger1Start: pinchStartPosition1,
        finger2Start: pinchStartPosition2,
        finger1Current: position1,
        finger2Current: position2,
      });
    }

    if (pinchMode === "pending" || pinchMode === "zoom" || pinchMode === "rotate") {
      const dx = avgPosition.x - previousAvgPosition.x;
      const dy = avgPosition.y - previousAvgPosition.y;

      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        panCameraByOrbitingGlobe(camera, viewer.scene.globe.ellipsoid, previousAvgPosition, avgPosition);
      }

      const center = pinchMode === "rotate"
        ? rotationCenter ?? pickRenderedGlobeOrTilePosition(viewer.scene, centerPosition)
        : pickRenderedGlobeOrTilePosition(viewer.scene, centerPosition);
      if (pinchMode === "rotate" && center) rotationCenter = center;
      // Momentum keeps using the last valid anchor if the fingers leave the visible globe.
      if (center) lastPinchCenter = center;

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
        if (center) {
          // Prefer anchored zoom, so pinching near an edge still zooms around that point.
          zoomCameraAroundGlobePoint(camera, center, distanceDelta * zoomFactor);
        } else {
          zoomCameraAlongViewDirection(camera, distanceDelta * zoomFactor);
        }
        keepCameraAboveRenderedSurface(viewer.scene);
      }

      if (pinchMode === "rotate" && center) {
        Cesium.Transforms.eastNorthUpToFixedFrame(center, undefined, rotationTransform);
        camera.lookAtTransform(rotationTransform);
        camera.rotateRight(angleDelta * 0.6);
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
    }

    if (pinchMode === "tilt") {
      if (!tiltCenter) {
        const canvas = viewer.scene.canvas;
        tiltCenterPosition.x = canvas.clientWidth / 2;
        tiltCenterPosition.y = canvas.clientHeight / 2;
        tiltCenter = pickRenderedGlobeOrTilePosition(
          viewer.scene,
          tiltCenterPosition,
        ) ?? null;
      }

      if (!tiltCenter) return;

      const tiltAmount = heightDelta * 0.02;
      const currentPitch = getCameraPitchRelativeToGlobePoint(camera, tiltCenter);
      const targetPitch = currentPitch - tiltAmount;
      let actualTiltAmount = tiltAmount;

      // When zooming out makes the view-center pitch exceed the normal range, avoid snapping
      // back to the limit. Let user input reduce the violation but block making it worse.
      if (currentPitch > MAX_PITCH) {
        if (targetPitch > currentPitch) {
          actualTiltAmount = 0;
        } else if (targetPitch < MIN_PITCH) {
          actualTiltAmount = currentPitch - MIN_PITCH;
        }
      } else if (currentPitch < MIN_PITCH) {
        if (targetPitch < currentPitch) {
          actualTiltAmount = 0;
        } else if (targetPitch > MAX_PITCH) {
          actualTiltAmount = currentPitch - MAX_PITCH;
        }
      } else if (targetPitch > MAX_PITCH) {
        actualTiltAmount = currentPitch - MAX_PITCH;
      } else if (targetPitch < MIN_PITCH) {
        actualTiltAmount = currentPitch - MIN_PITCH;
      }

      if (Math.abs(actualTiltAmount) > 0) {
        Cesium.Transforms.eastNorthUpToFixedFrame(tiltCenter, undefined, tiltTransform);
        camera.lookAtTransform(tiltTransform);
        camera.rotateDown(actualTiltAmount);
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
    }
  };

  const handlePinchEnd = () => {
    gestureState.isPinching = false;
    gestureState.hasJustPinched = true;
    if (revertHasJustPinchedTimeoutId) window.clearTimeout(revertHasJustPinchedTimeoutId);
    revertHasJustPinchedTimeoutId = window.setTimeout(() => gestureState.hasJustPinched = false, doubleTapThreshold);

    if (Math.abs(pinchZoomVelocity) > 0.1 && (pinchMode === "pending" || pinchMode === "zoom" || pinchMode === "rotate")) {
      if (pinchZoomVelocity > 5) pinchZoomVelocity = 5;
      if (pinchZoomVelocity < -5) pinchZoomVelocity = -5;

      let lastFrameTime = Date.now();
      let avgDt = 16;
      const animateMomentum = () => {
        const now = Date.now();
        const dt = now - lastFrameTime;
        lastFrameTime = now;

        avgDt = avgDt * 0.8 + Math.min(dt, 80) * 0.2;
        const effectiveDt = avgDt;

        if (Math.abs(pinchZoomVelocity) < 0.01) {
          controller.enableInputs = true;
          gestureState.momentumRequestId = null;
          return;
        }

        const distanceDelta = pinchZoomVelocity * effectiveDt;
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const zoomFactor = height * 0.003;

        if (lastPinchCenter) {
          zoomCameraAroundGlobePoint(camera, lastPinchCenter, distanceDelta * zoomFactor);
        } else {
          zoomCameraAlongViewDirection(camera, distanceDelta * zoomFactor);
        }
        keepCameraAboveRenderedSurface(viewer.scene);

        pinchZoomVelocity *= 0.64;

        gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
      };
      gestureState.momentumRequestId = window.requestAnimationFrame(animateMomentum);
    }
  };

  return {
    handlePinchStart,
    handlePinchMove,
    handlePinchEnd,
  };
}

function classifyPendingPinchGesture(gesture: PendingPinchGesture): PinchMode {
  const shouldLockZoom = Math.abs(gesture.currentDistance - gesture.startDistance) >= ZOOM_LOCK_DISTANCE_PIXELS;
  const shouldPromoteRotate = Math.abs(getAngleDelta(gesture.startAngle, gesture.currentAngle)) >= ROTATE_PROMOTION_RADIANS;
  const shouldPromoteTilt = getTiltPromotionMovementPixels(gesture) >= TILT_PROMOTION_CENTER_PIXELS;

  if (shouldLockZoom) return "zoom";
  if (shouldPromoteRotate && !shouldPromoteTilt) return "rotate";
  if (shouldPromoteTilt && !shouldPromoteRotate) return "tilt";
  return "pending";
}

function getTiltPromotionMovementPixels(gesture: PendingPinchGesture): number {
  const centerDx = gesture.currentCenter.x - gesture.startCenter.x;
  const centerDy = gesture.currentCenter.y - gesture.startCenter.y;
  const absCenterDy = Math.abs(centerDy);

  if (Math.abs(centerDx) * TILT_HORIZONTAL_REJECTION_RATIO > absCenterDy) return 0;

  const finger1Dx = gesture.finger1Current.x - gesture.finger1Start.x;
  const finger1Dy = gesture.finger1Current.y - gesture.finger1Start.y;
  const finger2Dx = gesture.finger2Current.x - gesture.finger2Start.x;
  const finger2Dy = gesture.finger2Current.y - gesture.finger2Start.y;
  const sameVerticalDirection = finger1Dy === 0 || finger2Dy === 0 || Math.sign(finger1Dy) === Math.sign(finger2Dy);
  if (!sameVerticalDirection) return 0;

  const relativeMotion = Math.hypot(finger1Dx - finger2Dx, finger1Dy - finger2Dy);
  const commonMotion = Math.hypot((finger1Dx + finger2Dx) / 2, (finger1Dy + finger2Dy) / 2);
  const relativeMotionTolerance = Math.max(
    TILT_RELATIVE_MOTION_TOLERANCE_PIXELS,
    commonMotion * TILT_RELATIVE_MOTION_RATIO,
  );
  if (relativeMotion > relativeMotionTolerance) return 0;

  return absCenterDy;
}

function getAngleDelta(startAngle: number, endAngle: number): number {
  let angleDelta = endAngle - startAngle;

  if (angleDelta > Math.PI) {
    angleDelta -= 2 * Math.PI;
  } else if (angleDelta < -Math.PI) {
    angleDelta += 2 * Math.PI;
  }

  return angleDelta;
}
