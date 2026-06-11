/**
 * Creates Cesium pinch handlers for zoom, pan, rotate, tilt, and momentum.
 */

import * as Cesium from "cesium";
import { panCameraByOrbitingGlobe, zoomCameraAroundGlobePoint } from "../camera/cameraGestures";
import type { InteractionGestureState } from "../state/interactionGestureState";

interface PinchMoveEvent {
  distance: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
  angleAndHeight: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
}

interface PinchGestureHandlers {
  handlePinchStart: () => void;
  handlePinchMove: (event: PinchMoveEvent) => void;
  handlePinchEnd: () => void;
}

export function createPinchGestureHandlers(
  viewer: Cesium.Viewer,
  handler: Cesium.ScreenSpaceEventHandler,
  controller: Cesium.ScreenSpaceCameraController,
  gestureState: InteractionGestureState,
  doubleTapThreshold: number,
): PinchGestureHandlers {
  const camera = viewer.camera;

  let pinchMode: "zoom" | "rotate" | "tilt" = "zoom";
  let totalZoomDelta = 0;
  let totalAngleDelta = 0;
  let totalHeightDelta = 0;
  let lastPinchMoveTime = 0;
  let pinchZoomVelocity = 0;
  let lastPinchCenter: Cesium.Cartesian3 | null = null;
  let revertHasJustPinchedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const zoomThreshold = 6.0;
  const rotateThreshold = 0.1;
  const tiltThreshold = 4.0;
  const minPitch = Cesium.Math.toRadians(-90);
  const maxPitch = Cesium.Math.toRadians(-60);

  const handlePinchStart = () => {
    gestureState.isPinching = true;
    pinchMode = "zoom";
    totalZoomDelta = 0;
    totalAngleDelta = 0;
    totalHeightDelta = 0;
    pinchZoomVelocity = 0;
    lastPinchMoveTime = Date.now();

    if (gestureState.momentumRequestId) {
      cancelAnimationFrame(gestureState.momentumRequestId);
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

    const avgPosition = new Cesium.Cartesian2(
      (position1.x + position2.x) / 2,
      (position1.y + position2.y) / 2
    );

    const previousAvgPosition = new Cesium.Cartesian2(
      (previousPosition1.x + previousPosition2.x) / 2,
      (previousPosition1.y + previousPosition2.y) / 2
    );

    const centerPosition = new Cesium.Cartesian2(
      (avgPosition.x + previousAvgPosition.x) / 2,
      (avgPosition.y + previousAvgPosition.y) / 2
    );

    const zoomDelta = event.distance.endPosition.y - event.distance.startPosition.y;
    let angleDelta = event.angleAndHeight.endPosition.x - event.angleAndHeight.startPosition.x;
    const heightDelta = event.angleAndHeight.endPosition.y - event.angleAndHeight.startPosition.y;

    if (angleDelta > Math.PI) {
      angleDelta -= 2 * Math.PI;
    } else if (angleDelta < -Math.PI) {
      angleDelta += 2 * Math.PI;
    }

    totalZoomDelta += Math.abs(zoomDelta);
    totalAngleDelta += angleDelta;
    totalHeightDelta += heightDelta;

    if (pinchMode === "zoom") {
      if (totalZoomDelta > zoomThreshold) {
        pinchMode = "zoom";
      } else if (Math.abs(totalHeightDelta) > tiltThreshold) {
        pinchMode = "tilt";
      } else if (Math.abs(totalAngleDelta) > rotateThreshold) {
        pinchMode = "rotate";
      }
    }

    if (pinchMode === "zoom" || pinchMode === "rotate") {
      const center = camera.pickEllipsoid(centerPosition, viewer.scene.globe.ellipsoid);

      if (center) {
        lastPinchCenter = center;

        const dx = avgPosition.x - previousAvgPosition.x;
        const dy = avgPosition.y - previousAvgPosition.y;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          panCameraByOrbitingGlobe(camera, viewer.scene.globe.ellipsoid, previousAvgPosition, avgPosition);
        }

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

      let actualTiltAmount = tiltAmount;
      const targetPitch = currentPitch - tiltAmount;
      if (targetPitch > maxPitch) {
        actualTiltAmount = currentPitch - maxPitch;
      } else if (targetPitch < minPitch) {
        actualTiltAmount = currentPitch - minPitch;
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
  };

  const handlePinchEnd = () => {
    gestureState.isPinching = false;
    gestureState.hasJustPinched = true;
    if (revertHasJustPinchedTimeoutId) clearTimeout(revertHasJustPinchedTimeoutId);
    revertHasJustPinchedTimeoutId = setTimeout(() => gestureState.hasJustPinched = false, doubleTapThreshold);

    if (Math.abs(pinchZoomVelocity) > 0.1 && (pinchMode === "zoom" || pinchMode == "rotate")) {
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
        }

        pinchZoomVelocity *= 0.64;

        gestureState.momentumRequestId = requestAnimationFrame(animateMomentum);
      };
      gestureState.momentumRequestId = requestAnimationFrame(animateMomentum);
    }
  };

  return {
    handlePinchStart,
    handlePinchMove,
    handlePinchEnd,
  };
}
