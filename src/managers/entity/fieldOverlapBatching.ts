/**
 * Builds correctness-first field batches when coverage preprocessing is unavailable.
 */

import * as Cesium from "cesium";
import type { FieldData } from "../../types/iitc/field";

interface FieldRecord {
  data: FieldData;
}

interface PreparedField<T extends FieldRecord> {
  field: T;
  unitPositions: Cesium.Cartesian3[];
  sphericalArea: number;
}

const SPHERICAL_GEOMETRY_EPSILON = 1e-12;

export function createOverlapAwareFieldBatches<T extends FieldRecord>(fields: T[]): T[][] {
  const preparedFields = fields.map((field) => prepareField(field)).sort((first, second) =>
    second.sphericalArea - first.sphericalArea || first.field.data.guid.localeCompare(second.field.data.guid),
  );
  const batches: Array<Array<PreparedField<T>>> = [];

  preparedFields.forEach((field) => {
    const availableBatch = batches.find((batch) =>
      batch.every((existing) => !doSphericalTrianglesOverlap(field.unitPositions, existing.unitPositions)),
    );

    if (availableBatch) {
      availableBatch.push(field);
    } else {
      batches.push([field]);
    }
  },);

  return batches.map((batch) => batch.map((field) => field.field));
}

function prepareField<T extends FieldRecord>(field: T): PreparedField<T> {
  const unitPositions = field.data.points.map((point) => {
    const longitude = Cesium.Math.toRadians(point.lngE6 / 1e6);
    const latitude = Cesium.Math.toRadians(point.latE6 / 1e6);
    const cosLatitude = Math.cos(latitude);
    return new Cesium.Cartesian3(
      cosLatitude * Math.cos(longitude),
      cosLatitude * Math.sin(longitude),
      Math.sin(latitude),
    );
  },);

  return {
    field,
    unitPositions,
    sphericalArea: getSphericalTriangleArea(unitPositions),
  };
}

function getSphericalTriangleArea(positions: Cesium.Cartesian3[]): number {
  if (positions.length !== 3) return 0;

  const [first, second, third] = positions;
  const determinant = dot(first, cross(second, third));
  const denominator = 1 + dot(first, second) + dot(second, third) + dot(third, first);
  return 2 * Math.atan2(Math.abs(determinant), denominator);
}

function doSphericalTrianglesOverlap(
  first: Cesium.Cartesian3[],
  second: Cesium.Cartesian3[],
): boolean {
  if (first.length !== 3 || second.length !== 3) return true;
  if (haveSameVertices(first, second)) return true;

  if (first.some((position) => isStrictlyInsideSphericalTriangle(position, second))) return true;
  if (second.some((position) => isStrictlyInsideSphericalTriangle(position, first))) return true;

  for (let firstIndex = 0; firstIndex < 3; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % 3];
    for (let secondIndex = 0; secondIndex < 3; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % 3];
      if (doGreatCircleArcsProperlyIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }

  return false;
}

function haveSameVertices(first: Cesium.Cartesian3[], second: Cesium.Cartesian3[]): boolean {
  return first.every((firstPosition) =>
    second.some((secondPosition) => isSamePosition(firstPosition, secondPosition)),
  );
}

function isSamePosition(first: Cesium.Cartesian3, second: Cesium.Cartesian3): boolean {
  return dot(first, second) >= 1 - SPHERICAL_GEOMETRY_EPSILON;
}

function isStrictlyInsideSphericalTriangle(
  position: Cesium.Cartesian3,
  triangle: Cesium.Cartesian3[],
): boolean {
  for (let index = 0; index < 3; index += 1) {
    const start = triangle[index];
    const end = triangle[(index + 1) % 3];
    const opposite = triangle[(index + 2) % 3];
    const normal = normalizedCross(start, end);
    if (!normal) return false;

    const oppositeSide = dot(normal, opposite);
    const positionSide = dot(normal, position) * Math.sign(oppositeSide);
    if (Math.abs(oppositeSide) <= SPHERICAL_GEOMETRY_EPSILON
      || positionSide <= SPHERICAL_GEOMETRY_EPSILON) return false;
  }

  return true;
}

function doGreatCircleArcsProperlyIntersect(
  firstStart: Cesium.Cartesian3,
  firstEnd: Cesium.Cartesian3,
  secondStart: Cesium.Cartesian3,
  secondEnd: Cesium.Cartesian3,
): boolean {
  if (isSamePosition(firstStart, secondStart)
    || isSamePosition(firstStart, secondEnd)
    || isSamePosition(firstEnd, secondStart)
    || isSamePosition(firstEnd, secondEnd)) return false;

  const firstNormal = normalizedCross(firstStart, firstEnd);
  const secondNormal = normalizedCross(secondStart, secondEnd);
  if (!firstNormal || !secondNormal) return false;

  const intersection = normalizedCross(firstNormal, secondNormal);
  if (!intersection) return false;
  const oppositeIntersection = negate(intersection);

  return isInsideGreatCircleArc(intersection, firstStart, firstEnd, firstNormal)
    && isInsideGreatCircleArc(intersection, secondStart, secondEnd, secondNormal)
    || isInsideGreatCircleArc(oppositeIntersection, firstStart, firstEnd, firstNormal)
    && isInsideGreatCircleArc(oppositeIntersection, secondStart, secondEnd, secondNormal);
}

function isInsideGreatCircleArc(
  position: Cesium.Cartesian3,
  start: Cesium.Cartesian3,
  end: Cesium.Cartesian3,
  normal: Cesium.Cartesian3,
): boolean {
  return dot(cross(start, position), normal) > SPHERICAL_GEOMETRY_EPSILON
    && dot(cross(position, end), normal) > SPHERICAL_GEOMETRY_EPSILON;
}

function normalizedCross(first: Cesium.Cartesian3, second: Cesium.Cartesian3): Cesium.Cartesian3 | undefined {
  const result = cross(first, second);
  const magnitude = Math.hypot(result.x, result.y, result.z);
  if (magnitude <= SPHERICAL_GEOMETRY_EPSILON) return undefined;

  result.x /= magnitude;
  result.y /= magnitude;
  result.z /= magnitude;
  return result;
}

function cross(first: Cesium.Cartesian3, second: Cesium.Cartesian3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x,
  );
}

function dot(first: Cesium.Cartesian3, second: Cesium.Cartesian3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function negate(position: Cesium.Cartesian3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(-position.x, -position.y, -position.z);
}
