/**
 * Camera math helpers for custom globe pan and zoom gestures.
 */

import * as Cesium from "cesium";

export const MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS = 5;

const panStartScratch = new Cesium.Cartesian3();
const panEndScratch = new Cesium.Cartesian3();
const panStartNormalScratch = new Cesium.Cartesian3();
const panEndNormalScratch = new Cesium.Cartesian3();
const panAxisScratch = new Cesium.Cartesian3();
const pitchTransformScratch = new Cesium.Matrix4();
const pitchInverseTransformScratch = new Cesium.Matrix4();
const pitchLocalDirectionScratch = new Cesium.Cartesian3();
const correctedCameraCartographicScratch = new Cesium.Cartographic();
const correctedCameraPositionScratch = new Cesium.Cartesian3();
const gesturePickRayScratch = new Cesium.Ray();
const gesturePickTerrainScratch = new Cesium.Cartesian3();
const gesturePickEllipsoidScratch = new Cesium.Cartesian3();
const zoomTransformScratch = new Cesium.Matrix4();
const zoomInverseTransformScratch = new Cesium.Matrix4();
const zoomLocalPositionScratch = new Cesium.Cartesian3();
const zoomLocalDirectionScratch = new Cesium.Cartesian3();
const zoomLocalUpScratch = new Cesium.Cartesian3();

export interface GestureSurfacePicker {
  pick(windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined;
  reset(): void;
}

export function createGestureSurfacePicker(scene: Cesium.Scene): GestureSurfacePicker {
  const renderedPositionScratch = new Cesium.Cartesian3();
  const tangentPositionScratch = new Cesium.Cartesian3();
  const tangentRayScratch = new Cesium.Ray();
  const planePoint = new Cesium.Cartesian3();
  const planeNormal = new Cesium.Cartesian3();
  const rayToPlanePointScratch = new Cesium.Cartesian3();
  let hasTangentPlane = false;

  const reset = () => {
    hasTangentPlane = false;
  };

  const pick = (windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined => {
    if (scene.globe.show) return pickGestureSurfacePosition(scene, windowPosition);

    if (!scene.pickPositionSupported) return pickGestureEllipsoidPosition(scene, windowPosition);

    if (!hasTangentPlane) {
      const renderedPosition = scene.pickPosition(windowPosition, renderedPositionScratch);
      if (renderedPosition) {
        updateTangentPlane(renderedPosition);
        return renderedPosition;
      }
    }

    const tangentPosition = pickTangentPlanePosition(windowPosition);
    if (tangentPosition) return tangentPosition;

    return pickGestureEllipsoidPosition(scene, windowPosition);
  };

  const updateTangentPlane = (
    renderedPosition: Cesium.Cartesian3,
  ) => {
    Cesium.Cartesian3.clone(renderedPosition, planePoint);
    scene.globe.ellipsoid.geodeticSurfaceNormal(renderedPosition, planeNormal);
    hasTangentPlane = true;
  };

  const pickTangentPlanePosition = (windowPosition: Cesium.Cartesian2): Cesium.Cartesian3 | undefined => {
    if (!hasTangentPlane) return undefined;

    const ray = scene.camera.getPickRay(windowPosition, tangentRayScratch);
    if (!ray) return undefined;

    const denominator = Cesium.Cartesian3.dot(planeNormal, ray.direction);
    if (Math.abs(denominator) < Cesium.Math.EPSILON6) return undefined;

    Cesium.Cartesian3.subtract(planePoint, ray.origin, rayToPlanePointScratch);
    const distance = Cesium.Cartesian3.dot(rayToPlanePointScratch, planeNormal) / denominator;
    if (distance <= 0) return undefined;

    return Cesium.Ray.getPoint(ray, distance, tangentPositionScratch);
  };

  return { pick, reset };
}

export function pickGestureSurfacePosition(
  scene: Cesium.Scene,
  windowPosition: Cesium.Cartesian2,
  surfacePicker?: GestureSurfacePicker,
): Cesium.Cartesian3 | undefined {
  if (surfacePicker) return surfacePicker.pick(windowPosition);

  const camera = scene.camera;
  const globe = scene.globe;

  if (!globe.show && scene.pickPositionSupported) {
    const renderedPosition = scene.pickPosition(windowPosition);
    if (renderedPosition) return renderedPosition;
  }

  const ray = camera.getPickRay(windowPosition, gesturePickRayScratch);

  if (ray && globe) {
    const terrainIntersection = globe.pick(ray, scene, gesturePickTerrainScratch);
    if (terrainIntersection) return terrainIntersection;
  }

  return globe
    ? camera.pickEllipsoid(windowPosition, globe.ellipsoid, gesturePickEllipsoidScratch)
    : undefined;
}

export function panCameraByOrbitingSurface(
  scene: Cesium.Scene,
  startPosition: Cesium.Cartesian2,
  endPosition: Cesium.Cartesian2,
  surfacePicker?: GestureSurfacePicker,
): void {
  const camera = scene.camera;
  const start = pickGestureSurfacePosition(scene, startPosition, surfacePicker);
  if (!start) return;

  Cesium.Cartesian3.clone(start, panStartScratch);

  const end = pickGestureSurfacePosition(scene, endPosition, surfacePicker);
  if (!end) return;

  Cesium.Cartesian3.clone(end, panEndScratch);

  // Treat the two picked surface points as unit vectors from the globe center.
  // Rotating the camera around their cross-product axis makes the ground slide
  // under the fingers without changing camera height.
  const startNormal = Cesium.Cartesian3.normalize(panStartScratch, panStartNormalScratch);
  const endNormal = Cesium.Cartesian3.normalize(panEndScratch, panEndNormalScratch);
  const dot = Cesium.Cartesian3.dot(startNormal, endNormal);
  const axis = Cesium.Cartesian3.cross(startNormal, endNormal, panAxisScratch);

  if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) return;

  Cesium.Cartesian3.normalize(axis, axis);
  camera.rotate(axis, Cesium.Math.acosClamped(dot));
}

function pickGestureEllipsoidPosition(
  scene: Cesium.Scene,
  windowPosition: Cesium.Cartesian2,
): Cesium.Cartesian3 | undefined {
  const globe = scene.globe;
  return globe
    ? scene.camera.pickEllipsoid(windowPosition, globe.ellipsoid, gesturePickEllipsoidScratch)
    : undefined;
}

export function zoomCameraAlongViewDirection(camera: Cesium.Camera, amount: number): void {
  camera.zoomIn(amount);
}

export function keepCameraAboveRenderedSurface(scene: Cesium.Scene): void {
  if (!scene.sampleHeightSupported) return;

  const camera = scene.camera;
  const cartographic = camera.positionCartographic;
  const surfaceHeight = scene.sampleHeight(cartographic);

  if (surfaceHeight === undefined) return;

  const minimumCameraHeight = surfaceHeight + MINIMUM_3D_TILE_CAMERA_CLEARANCE_METERS;
  if (cartographic.height >= minimumCameraHeight) return;

  correctedCameraCartographicScratch.longitude = cartographic.longitude;
  correctedCameraCartographicScratch.latitude = cartographic.latitude;
  correctedCameraCartographicScratch.height = minimumCameraHeight;

  camera.setView({
    destination: Cesium.Cartographic.toCartesian(
      correctedCameraCartographicScratch,
      scene.globe.ellipsoid,
      correctedCameraPositionScratch,
    ),
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  });
}

export function getCameraPitchRelativeToGlobePoint(camera: Cesium.Camera, center: Cesium.Cartesian3): number {
  // Measure pitch against the same local ground frame that tilt gestures rotate around.
  // Cesium's camera.pitch is relative to the camera's own nadir point, which diverges at a globe scale.
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center, undefined, pitchTransformScratch);
  const inverseTransform = Cesium.Matrix4.inverseTransformation(transform, pitchInverseTransformScratch);
  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(inverseTransform, camera.directionWC, pitchLocalDirectionScratch);

  // In an ENU frame, +Z is local up. Looking level has z = 0, looking down has z < 0,
  // so asin(z) gives the signed pitch angle relative to the tangent plane.
  Cesium.Cartesian3.normalize(localDirection, localDirection);
  return Cesium.Math.asinClamped(localDirection.z);
}

export function zoomCameraAroundGlobePoint(camera: Cesium.Camera, center: Cesium.Cartesian3, amount: number): void {
  // Work in the picked point's ENU frame so zoom keeps the pinch anchor while preserving
  // the camera's local direction/up, i.e., its angle relative to the nearby ground.
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center, undefined, zoomTransformScratch);
  const inverseTransform = Cesium.Matrix4.inverseTransformation(transform, zoomInverseTransformScratch);

  // localPosition is the vector from the pinch anchor to the camera, expressed in
  // local east/north/up coordinates. Its length is the anchor-to-camera distance.
  const localPosition = Cesium.Matrix4.multiplyByPoint(inverseTransform, camera.positionWC, zoomLocalPositionScratch);
  const distance = Cesium.Cartesian3.magnitude(localPosition);

  if (distance <= 0) return;

  // Direction and up are vectors, not points, so ignore translation while converting them.
  // Keeping these vectors in the anchor frame preserves the ground-relative view angle.
  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
    inverseTransform,
    camera.directionWC,
    zoomLocalDirectionScratch,
  );
  const localUp = Cesium.Matrix4.multiplyByPointAsVector(
    inverseTransform,
    camera.upWC,
    zoomLocalUpScratch,
  );
  const targetDistance = Math.max(1, distance - amount);
  const scale = targetDistance / distance;

  // Scaling the whole anchor-to-camera vector moves straight toward or away from the
  // picked point, so the pinch anchor remains the center of the zoom operation.
  Cesium.Cartesian3.multiplyByScalar(localPosition, scale, localPosition);
  Cesium.Cartesian3.normalize(localDirection, localDirection);
  Cesium.Cartesian3.normalize(localUp, localUp);

  // Mutate the camera in the temporary local frame, then return to world coordinates.
  camera.lookAtTransform(transform);
  Cesium.Cartesian3.clone(localPosition, camera.position);
  Cesium.Cartesian3.clone(localDirection, camera.direction);
  Cesium.Cartesian3.clone(localUp, camera.up);

  // Cesium expects direction/up/right to be an orthonormal basis. Rebuild right and
  // then up so a tiny floating-point drift does not accumulate across repeated pinches.
  Cesium.Cartesian3.cross(camera.direction, camera.up, camera.right);
  Cesium.Cartesian3.normalize(camera.right, camera.right);
  Cesium.Cartesian3.cross(camera.right, camera.direction, camera.up);
  Cesium.Cartesian3.normalize(camera.up, camera.up);
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}
