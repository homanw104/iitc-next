import * as Cesium from "cesium";

export function panCameraByOrbitingGlobe(
  camera: Cesium.Camera,
  ellipsoid: Cesium.Ellipsoid,
  startPosition: Cesium.Cartesian2,
  endPosition: Cesium.Cartesian2,
): void {
  const start = camera.pickEllipsoid(startPosition, ellipsoid);
  const end = camera.pickEllipsoid(endPosition, ellipsoid);

  if (!start || !end) return;

  const startNormal = Cesium.Cartesian3.normalize(start, new Cesium.Cartesian3());
  const endNormal = Cesium.Cartesian3.normalize(end, new Cesium.Cartesian3());
  const dot = Cesium.Cartesian3.dot(startNormal, endNormal);
  const axis = Cesium.Cartesian3.cross(startNormal, endNormal, new Cesium.Cartesian3());

  if (Cesium.Cartesian3.equalsEpsilon(axis, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) return;

  Cesium.Cartesian3.normalize(axis, axis);
  camera.rotate(axis, Cesium.Math.acosClamped(dot));
}

function getCameraUpForDirection(direction: Cesium.Cartesian3, previousUp: Cesium.Cartesian3): Cesium.Cartesian3 {
  const right = Cesium.Cartesian3.cross(direction, previousUp, new Cesium.Cartesian3());

  if (Cesium.Cartesian3.equalsEpsilon(right, Cesium.Cartesian3.ZERO, Cesium.Math.EPSILON14)) {
    Cesium.Cartesian3.mostOrthogonalAxis(direction, right);
  }

  Cesium.Cartesian3.normalize(right, right);
  const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
  return Cesium.Cartesian3.normalize(up, up);
}

export function zoomCameraAroundGlobePoint(camera: Cesium.Camera, center: Cesium.Cartesian3, amount: number): void {
  const offset = Cesium.Cartesian3.subtract(camera.positionWC, center, new Cesium.Cartesian3());
  const distance = Cesium.Cartesian3.magnitude(offset);

  if (distance <= 0) return;

  const targetDistance = Math.max(1, distance - amount);
  const direction = Cesium.Cartesian3.normalize(offset, offset);
  const destination = Cesium.Cartesian3.multiplyByScalar(direction, targetDistance, new Cesium.Cartesian3());

  Cesium.Cartesian3.add(center, destination, destination);
  const viewDirection = Cesium.Cartesian3.negate(destination, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(viewDirection, viewDirection);

  camera.setView({
    destination,
    orientation: {
      direction: viewDirection,
      up: getCameraUpForDirection(viewDirection, camera.upWC),
    },
  });
}
