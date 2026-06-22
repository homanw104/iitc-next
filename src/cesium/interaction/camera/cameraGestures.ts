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

export function pickRenderedGlobeOrTilePosition(
  scene: Cesium.Scene,
  windowPosition: Cesium.Cartesian2,
): Cesium.Cartesian3 | undefined {
  const camera = scene.camera;
  const globe = scene.globe;

  let depthIntersection: Cesium.Cartesian3 | undefined;
  if (scene.pickPositionSupported) {
    depthIntersection = scene.pickPosition(windowPosition);
  }

  const ray = camera.getPickRay(windowPosition);
  const terrainIntersection = globe && ray
    ? globe.pick(ray, scene)
    : undefined;

  const depthDistance = depthIntersection
    ? Cesium.Cartesian3.distance(depthIntersection, camera.positionWC)
    : Number.POSITIVE_INFINITY;
  const terrainDistance = terrainIntersection
    ? Cesium.Cartesian3.distance(terrainIntersection, camera.positionWC)
    : Number.POSITIVE_INFINITY;

  if (depthDistance < terrainDistance) return depthIntersection;
  if (terrainIntersection) return terrainIntersection;

  return ray && globe
    ? camera.pickEllipsoid(windowPosition, globe.ellipsoid)
    : undefined;
}

export function panCameraByOrbitingGlobe(
  camera: Cesium.Camera,
  ellipsoid: Cesium.Ellipsoid,
  startPosition: Cesium.Cartesian2,
  endPosition: Cesium.Cartesian2,
): void {
  const start = camera.pickEllipsoid(startPosition, ellipsoid, panStartScratch);
  const end = camera.pickEllipsoid(endPosition, ellipsoid, panEndScratch);

  if (!start || !end) return;

  // Treat the two picked surface points as unit vectors from the globe center.
  // Rotating the camera around their cross-product axis makes the ground slide
  // under the fingers without changing camera height.
  const startNormal = Cesium.Cartesian3.normalize(start, panStartNormalScratch);
  const endNormal = Cesium.Cartesian3.normalize(end, panEndNormalScratch);
  const dot = Cesium.Cartesian3.dot(startNormal, endNormal);
  const axis = Cesium.Cartesian3.cross(startNormal, endNormal, panAxisScratch);

  if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) return;

  Cesium.Cartesian3.normalize(axis, axis);
  camera.rotate(axis, Cesium.Math.acosClamped(dot));
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

  const correctedPosition = new Cesium.Cartographic(
    cartographic.longitude,
    cartographic.latitude,
    minimumCameraHeight,
  );

  camera.setView({
    destination: Cesium.Cartographic.toCartesian(correctedPosition, scene.globe.ellipsoid),
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
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const inverseTransform = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());

  // localPosition is the vector from the pinch anchor to the camera, expressed in
  // local east/north/up coordinates. Its length is the anchor-to-camera distance.
  const localPosition = Cesium.Matrix4.multiplyByPoint(inverseTransform, camera.positionWC, new Cesium.Cartesian3());
  const distance = Cesium.Cartesian3.magnitude(localPosition);

  if (distance <= 0) return;

  // Direction and up are vectors, not points, so ignore translation while converting them.
  // Keeping these vectors in the anchor frame preserves the ground-relative view angle.
  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(inverseTransform, camera.directionWC, new Cesium.Cartesian3());
  const localUp = Cesium.Matrix4.multiplyByPointAsVector(inverseTransform, camera.upWC, new Cesium.Cartesian3());
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
