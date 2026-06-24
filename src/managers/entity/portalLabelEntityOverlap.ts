import * as Cesium from "cesium";
import {
  PORTAL_LABEL_ENTITY_PIXEL_OFFSET_Y,
  PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  getPortalLabelEntityPosition,
} from "./portalLabelEntityLayout";
import type { PortalLabelEntity, PortalLabelEntityScreenBounds } from "./portalLabelEntityTypes";

const PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX = 32;
const PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX = 128;

const portalLabelEntityWindowPositionScratch = new Cesium.Cartesian2();
const portalLabelEntityOverlapCartographicScratch = new Cesium.Cartographic();

interface PortalLabelEntityOverlapCandidate {
  guid: string;
  bounds: PortalLabelEntityScreenBounds;
  linkCount: number;
  level: number;
  isCurrentlyVisible: boolean;
  distance: number;
}

export function getNonOverlappingPortalLabelEntityGuids(
  viewer: Cesium.Viewer,
  labels: Map<string, PortalLabelEntity>,
  time: Cesium.JulianDate,
): Set<string> {
  const candidates: PortalLabelEntityOverlapCandidate[] = [];
  const viewRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);

  labels.forEach((label, guid) => {
    const labelPosition = getPortalLabelEntityPosition(label, time);
    if (!labelPosition) return;
    if (!isPortalLabelEntityPositionInViewRectangle(viewer, labelPosition, viewRectangle)) return;

    const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      labelPosition,
      portalLabelEntityWindowPositionScratch,
    );
    if (!windowPosition) return;

    const bounds = getPortalLabelEntityScreenBounds(label, windowPosition);
    if (!isPortalLabelEntityScreenBoundsInCanvas(bounds, viewer.scene.canvas)) return;

    candidates.push({
      guid,
      bounds,
      linkCount: label.linkCount,
      level: label.data.level ?? 0,
      isCurrentlyVisible: isPortalLabelEntityCurrentlyVisible(label),
      distance: Cesium.Cartesian3.distance(viewer.camera.positionWC, labelPosition),
    });
  });

  candidates.sort(comparePortalLabelEntityOverlapCandidates);

  const acceptedGuids = new Set<string>();
  const acceptedBoundsGrid = new Map<string, PortalLabelEntityOverlapCandidate[]>();
  candidates.forEach((candidate) => {
    if (doesOverlapAcceptedCandidate(candidate.bounds, acceptedBoundsGrid)) return;

    acceptedGuids.add(candidate.guid);
    addAcceptedCandidateToGrid(candidate, acceptedBoundsGrid);
  });
  return acceptedGuids;
}

function comparePortalLabelEntityOverlapCandidates(
  a: PortalLabelEntityOverlapCandidate,
  b: PortalLabelEntityOverlapCandidate,
): number {
  return b.linkCount - a.linkCount ||
    b.level - a.level ||
    a.distance - b.distance ||
    Number(b.isCurrentlyVisible) - Number(a.isCurrentlyVisible) ||
    a.guid.localeCompare(b.guid);
}

function isPortalLabelEntityCurrentlyVisible(label: PortalLabelEntity): boolean {
  return label.entity.show && label.targetOpacity === PORTAL_LABEL_ENTITY_VISIBLE_OPACITY;
}

function isPortalLabelEntityPositionInViewRectangle(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
  viewRectangle: Cesium.Rectangle | undefined,
): boolean {
  if (!viewRectangle) return true;

  const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(
    labelPosition,
    portalLabelEntityOverlapCartographicScratch,
  );
  return !!cartographic && Cesium.Rectangle.contains(viewRectangle, cartographic);
}

function getPortalLabelEntityScreenBounds(
  label: PortalLabelEntity,
  windowPosition: Cesium.Cartesian2,
): PortalLabelEntityScreenBounds {
  const anchorY = windowPosition.y + PORTAL_LABEL_ENTITY_PIXEL_OFFSET_Y;

  return {
    left: windowPosition.x - label.screenBoxWidth / 2 - PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX,
    top: anchorY - label.screenBoxHeight - PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX,
    right: windowPosition.x + label.screenBoxWidth / 2 + PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX,
    bottom: anchorY + PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX,
  };
}

function isPortalLabelEntityScreenBoundsInCanvas(
  bounds: PortalLabelEntityScreenBounds,
  canvas: HTMLCanvasElement,
): boolean {
  return bounds.right >= 0 &&
    bounds.left <= canvas.clientWidth &&
    bounds.bottom >= 0 &&
    bounds.top <= canvas.clientHeight;
}

function doScreenBoundsOverlap(
  a: PortalLabelEntityScreenBounds,
  b: PortalLabelEntityScreenBounds,
): boolean {
  return a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
}

function doesOverlapAcceptedCandidate(
  bounds: PortalLabelEntityScreenBounds,
  acceptedBoundsGrid: Map<string, PortalLabelEntityOverlapCandidate[]>,
): boolean {
  const seenGuids = new Set<string>();
  const range = getScreenBoundsGridRange(bounds);

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const candidates = acceptedBoundsGrid.get(getOverlapGridKey(x, y));
      if (!candidates) continue;

      for (const candidate of candidates) {
        if (seenGuids.has(candidate.guid)) continue;

        seenGuids.add(candidate.guid);
        if (doScreenBoundsOverlap(bounds, candidate.bounds)) return true;
      }
    }
  }

  return false;
}

function addAcceptedCandidateToGrid(
  candidate: PortalLabelEntityOverlapCandidate,
  acceptedBoundsGrid: Map<string, PortalLabelEntityOverlapCandidate[]>,
): void {
  const range = getScreenBoundsGridRange(candidate.bounds);

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const key = getOverlapGridKey(x, y);
      const candidates = acceptedBoundsGrid.get(key) ?? [];
      candidates.push(candidate);
      acceptedBoundsGrid.set(key, candidates);
    }
  }
}

function getScreenBoundsGridRange(bounds: PortalLabelEntityScreenBounds): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number
} {
  return {
    minX: Math.floor(bounds.left / PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX),
    maxX: Math.floor(bounds.right / PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX),
    minY: Math.floor(bounds.top / PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX),
    maxY: Math.floor(bounds.bottom / PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX),
  };
}

function getOverlapGridKey(x: number, y: number): string {
  return `${x},${y}`;
}
