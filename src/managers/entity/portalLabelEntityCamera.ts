/**
 * Tracks camera movement that can make portal label visibility stale.
 *
 * Label overlap and occlusion checks are expensive on dense views, so the
 * manager only refreshes while the camera is moving after enough time and
 * camera motion has accumulated. This helper owns the camera snapshots and
 * threshold math; the manager only receives callbacks when overlap state should
 * be invalidated or refreshed.
 */

import * as Cesium from "cesium";

const LABEL_CAMERA_MOVE_VISIBILITY_UPDATE_INTERVAL_MS = 1000;
const LABEL_CAMERA_MOVE_MIN_POSITION_METERS = 5;
const LABEL_CAMERA_MOVE_HEIGHT_FACTOR = 0.01;
const LABEL_CAMERA_MOVE_MIN_ANGLE_RADIANS = Cesium.Math.toRadians(0.5);

const cameraCartographicScratch = new Cesium.Cartographic();

export class PortalLabelEntityCameraMoveTracker {
  private isMoving = false;
  private lastVisibilityUpdate = 0;
  private hasCameraSnapshot = false;
  private lastCameraPosition = new Cesium.Cartesian3();
  private lastCameraDirection = new Cesium.Cartesian3();
  private lastCameraUp = new Cesium.Cartesian3();

  constructor(
    private viewer: Cesium.Viewer,
    private onMoveStarted: () => void,
    private onVisibilityUpdateNeeded: () => void,
  ) {
    this.viewer.camera.moveStart.addEventListener(() => this.handleMoveStart());
    this.viewer.camera.moveEnd.addEventListener(() => this.handleMoveEnd());
    this.viewer.scene.preRender.addEventListener(() => this.handlePreRender());
  }

  public captureSnapshot(): void {
    Cesium.Cartesian3.clone(this.viewer.camera.positionWC, this.lastCameraPosition);
    Cesium.Cartesian3.clone(this.viewer.camera.directionWC, this.lastCameraDirection);
    Cesium.Cartesian3.clone(this.viewer.camera.upWC, this.lastCameraUp);
    this.hasCameraSnapshot = true;
  }

  private handleMoveStart(): void {
    this.isMoving = true;
    this.lastVisibilityUpdate = performance.now();
    this.onMoveStarted();
  }

  private handleMoveEnd(): void {
    this.isMoving = false;
  }

  private handlePreRender(): void {
    if (!this.isMoving) return;

    const now = performance.now();
    if (now - this.lastVisibilityUpdate < LABEL_CAMERA_MOVE_VISIBILITY_UPDATE_INTERVAL_MS) return;
    if (!this.hasCameraMovedEnoughForVisibility()) return;

    this.lastVisibilityUpdate = now;
    this.onVisibilityUpdateNeeded();
  }

  private hasCameraMovedEnoughForVisibility(): boolean {
    if (!this.hasCameraSnapshot) return true;

    const camera = this.viewer.camera;
    const height = this.viewer.scene.globe.ellipsoid.cartesianToCartographic(
      camera.positionWC,
      cameraCartographicScratch,
    )?.height ?? 0;
    const positionThreshold = Math.max(
      LABEL_CAMERA_MOVE_MIN_POSITION_METERS,
      Math.abs(height) * LABEL_CAMERA_MOVE_HEIGHT_FACTOR,
    );
    if (Cesium.Cartesian3.distance(camera.positionWC, this.lastCameraPosition) >= positionThreshold) {
      return true;
    }

    const angleThresholdCosine = Math.cos(LABEL_CAMERA_MOVE_MIN_ANGLE_RADIANS);
    return Cesium.Cartesian3.dot(camera.directionWC, this.lastCameraDirection) <= angleThresholdCosine ||
      Cesium.Cartesian3.dot(camera.upWC, this.lastCameraUp) <= angleThresholdCosine;
  }
}
