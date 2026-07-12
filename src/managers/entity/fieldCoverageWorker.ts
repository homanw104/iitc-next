/**
 * Create a data-URL worker for field coverage preprocessing in a userscript realm.
 */

import polygonClippingSource from "polygon-clipping/dist/polygon-clipping.umd.min.js?raw";

// Vite's Blob-based inline worker does not start reliably from the userscript realm.
const fieldCoverageWorkerSource = `${polygonClippingSource}
const { difference, intersection, union } = polygonClipping;

// Keep exact-depth regions disjoint while each source field increments covered areas.
function createFieldCoverageRegions(fields) {
  const sortedFields = fields.map(field => ({
    field,
    sphericalArea: getSphericalTriangleArea(field),
  })).sort((first, second) =>
    second.sphericalArea - first.sphericalArea || first.field.guid.localeCompare(second.field.guid)
  );
  const referenceLongitude = (sortedFields[0]?.field.points[0]?.lngE6 ?? 0) / 1e6;
  const coverageByDepth = [];

  for (const { field } of sortedFields) {
    let remaining = [createClippingPolygon(field, referenceLongitude)];

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

function getSphericalTriangleArea(field) {
  if (field.points.length !== 3) return 0;

  const positions = field.points.map(point => {
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

function cross(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function dot(first, second) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function createClippingPolygon(field, referenceLongitude) {
  return [field.points.map(point => [
    unwrapLongitude(point.lngE6 / 1e6, referenceLongitude),
    point.latE6 / 1e6,
  ])];
}

function unwrapLongitude(longitude, referenceLongitude) {
  let unwrapped = longitude;
  while (unwrapped - referenceLongitude > 180) unwrapped -= 360;
  while (unwrapped - referenceLongitude < -180) unwrapped += 360;
  return unwrapped;
}

self.onmessage = (event) => {
  const { generation, layers } = event.data;

  try {
    self.postMessage({
      generation,
      layers: layers.map(layer => ({
        layerId: layer.layerId,
        coverageByDepth: createFieldCoverageRegions(layer.fields),
      })),
    });
  } catch (error) {
    self.postMessage({
      generation,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
`;
const fieldCoverageWorkerUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(fieldCoverageWorkerSource)}`;

export function createFieldCoverageWorker(): Worker {
  return new Worker(fieldCoverageWorkerUrl);
}
