/**
 * Runs typed field coverage preprocessing inside the generated worker.
 */

import type { MultiPolygon, Polygon } from "polygon-clipping";
import type {
  FieldCoverageInput,
  FieldCoverageMultiPolygon,
  FieldCoverageRequest,
  FieldCoverageResponse,
} from "./fieldCoverage";

type UnitPosition = [number, number, number];

interface FieldCoverageWorkerScope {
  polygonClipping: typeof import("polygon-clipping");
  onmessage: ((event: MessageEvent<FieldCoverageRequest>) => void) | null;
  postMessage(message: FieldCoverageResponse): void;
}

export function runFieldCoverageWorker(): void {
  const worker = self as unknown as FieldCoverageWorkerScope;
  const { difference, intersection, union } = worker.polygonClipping;

  // Keep exact-depth regions disjoint while each source field increments covered areas.
  function createFieldCoverageRegions(fields: FieldCoverageInput[]): FieldCoverageMultiPolygon[] {
    const sortedFields = fields.map((field) => ({
      field,
      sphericalArea: getSphericalTriangleArea(field),
    })).sort((first, second) =>
      second.sphericalArea - first.sphericalArea || first.field.guid.localeCompare(second.field.guid),
    );
    const referenceLongitude = (sortedFields[0]?.field.points[0]?.lngE6 ?? 0) / 1e6;
    const coverageByDepth: MultiPolygon[] = [];

    for (const { field } of sortedFields) {
      let remaining: MultiPolygon = [createClippingPolygon(field, referenceLongitude)];

      for (let index = coverageByDepth.length - 1; index >= 0 && remaining.length > 0; index -= 1) {
        const existing = coverageByDepth[index];
        const overlapping = intersection(existing, remaining);
        if (overlapping.length === 0) continue;

        coverageByDepth[index] = difference(existing, remaining);
        coverageByDepth[index + 1] = coverageByDepth[index + 1]?.length > 0
          ? union(coverageByDepth[index + 1], overlapping)
          : overlapping;
        remaining = difference(remaining, existing);
      }

      if (remaining.length > 0) {
        coverageByDepth[0] = coverageByDepth[0]?.length > 0
          ? union(coverageByDepth[0], remaining)
          : remaining;
      }
    }

    return coverageByDepth;
  }

  function getSphericalTriangleArea(field: FieldCoverageInput): number {
    if (field.points.length !== 3) return 0;

    const positions: UnitPosition[] = field.points.map((point) => {
      const longitude = point.lngE6 / 1e6 * Math.PI / 180;
      const latitude = point.latE6 / 1e6 * Math.PI / 180;
      const cosLatitude = Math.cos(latitude);
      return [
        cosLatitude * Math.cos(longitude),
        cosLatitude * Math.sin(longitude),
        Math.sin(latitude),
      ];
    });
    const [first, second, third] = positions;
    const determinant = dot(first, cross(second, third));
    const denominator = 1 + dot(first, second) + dot(second, third) + dot(third, first);
    return 2 * Math.atan2(Math.abs(determinant), denominator);
  }

  function cross(first: UnitPosition, second: UnitPosition): UnitPosition {
    return [
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0],
    ];
  }

  function dot(first: UnitPosition, second: UnitPosition): number {
    return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  }

  function createClippingPolygon(field: FieldCoverageInput, referenceLongitude: number): Polygon {
    return [field.points.map((point) => [
      unwrapLongitude(point.lngE6 / 1e6, referenceLongitude),
      point.latE6 / 1e6,
    ])];
  }

  function unwrapLongitude(longitude: number, referenceLongitude: number): number {
    let unwrapped = longitude;
    while (unwrapped - referenceLongitude > 180) unwrapped -= 360;
    while (unwrapped - referenceLongitude < -180) unwrapped += 360;
    return unwrapped;
  }

  worker.onmessage = (event) => {
    const { generation, layers } = event.data;

    try {
      worker.postMessage({
        generation,
        layers: layers.map((layer) => ({
          layerId: layer.layerId,
          coverageByDepth: createFieldCoverageRegions(layer.fields),
        })),
      });
    } catch (error) {
      worker.postMessage({
        generation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
