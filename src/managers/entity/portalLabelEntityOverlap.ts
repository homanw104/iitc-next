/**
 * Calculates portal label entity overlaps.
 */

import * as Cesium from "cesium";
import {
  PORTAL_LABEL_ENTITY_VISIBLE_OPACITY,
  getPortalLabelEntityPosition,
  getPortalLabelEntityPixelOffsetY,
} from "./portalLabelEntityLayout";
import type { PortalLabel, PortalLabelEntityScreenBounds } from "./portalLabelEntityTypes";
import { isPortalLabelEntityPositionVisible } from "./portalLabelEntityVisibility";

const PORTAL_LABEL_ENTITY_OVERLAP_PADDING_PX = 24;
const PORTAL_LABEL_ENTITY_OVERLAP_GRID_CELL_SIZE_PX = 128;
const PORTAL_LABEL_ENTITY_OVERLAP_ACCEPTED_LABELS_PER_FRAME = 1;
const PORTAL_LABEL_ENTITY_VIEW_RECTANGLE_MAX_PITCH = Cesium.Math.toRadians(-30);

const portalLabelEntityWindowPositionScratch = new Cesium.Cartesian2();
const portalLabelEntityOverlapCartographicScratch = new Cesium.Cartographic();

interface PortalLabelEntityOverlapCandidate {
  guid: string;
  bounds: PortalLabelEntityScreenBounds;
  position: Cesium.Cartesian3;
  firstShownAt: number | undefined;
  linkCount: number;
  level: number;
  isCurrentlyVisible: boolean;
  distance: number;
}

export async function getNonOverlappingPortalLabelEntityGuids(
  viewer: Cesium.Viewer,
  labels: Map<string, PortalLabel>,
  time: Cesium.JulianDate,
  onAcceptedGuid?: (guid: string) => void,
): Promise<Set<string>> {
  const candidates: PortalLabelEntityOverlapCandidate[] = [];
  const viewRectangle = getPortalLabelEntityViewRectangle(viewer);

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

    const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, labelPosition);
    const bounds = getPortalLabelEntityScreenBounds(label, windowPosition, distance);
    if (!isPortalLabelEntityScreenBoundsInCanvas(bounds, viewer.scene.canvas)) return;

    candidates.push({
      guid,
      bounds,
      position: labelPosition,
      firstShownAt: label.firstShownAt,
      linkCount: label.linkCount,
      level: label.data.level ?? 0,
      isCurrentlyVisible: isPortalLabelEntityCurrentlyVisible(label),
      distance,
    });
  });

  candidates.sort(comparePortalLabelEntityOverlapCandidates);

  const acceptedGuids = new Set<string>();
  const acceptedBoundsGrid = new Map<string, PortalLabelEntityOverlapCandidate[]>();
  let acceptedSinceLastFrame = 0;
  for (const candidate of candidates) {
    if (doesOverlapAcceptedCandidate(candidate.bounds, acceptedBoundsGrid)) continue;
    if (!isPortalLabelEntityPositionVisible(viewer, candidate.position)) continue;

    acceptedGuids.add(candidate.guid);
    addAcceptedCandidateToGrid(candidate, acceptedBoundsGrid);
    onAcceptedGuid?.(candidate.guid);
    acceptedSinceLastFrame++;

    if (acceptedSinceLastFrame >= PORTAL_LABEL_ENTITY_OVERLAP_ACCEPTED_LABELS_PER_FRAME) {
      acceptedSinceLastFrame = 0;
      await waitForNextFrame();
    }
  }
  return acceptedGuids;
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

function comparePortalLabelEntityOverlapCandidates(
  a: PortalLabelEntityOverlapCandidate,
  b: PortalLabelEntityOverlapCandidate,
): number {
  return Number(b.isCurrentlyVisible) - Number(a.isCurrentlyVisible) ||
    compareFirstShownAt(a.firstShownAt, b.firstShownAt) ||
    b.linkCount - a.linkCount ||
    b.level - a.level ||
    a.distance - b.distance ||
    a.guid.localeCompare(b.guid);
}

function compareFirstShownAt(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;

  return a - b;
}

function isPortalLabelEntityCurrentlyVisible(label: PortalLabel): boolean {
  return label.entity.show && label.targetOpacity === PORTAL_LABEL_ENTITY_VISIBLE_OPACITY;
}

function getPortalLabelEntityViewRectangle(viewer: Cesium.Viewer): Cesium.Rectangle | undefined {
  const camera = viewer.camera;
  if (camera.pitch <= PORTAL_LABEL_ENTITY_VIEW_RECTANGLE_MAX_PITCH) {
    return camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  }

  const clampedCamera = new Cesium.Camera(viewer.scene);
  clampedCamera.frustum = camera.frustum.clone();
  clampedCamera.setView({
    destination: Cesium.Cartesian3.clone(camera.positionWC),
    orientation: {
      heading: camera.heading,
      pitch: PORTAL_LABEL_ENTITY_VIEW_RECTANGLE_MAX_PITCH,
      roll: camera.roll,
    },
    endTransform: Cesium.Matrix4.clone(camera.transform),
  });

  return clampedCamera.computeViewRectangle(viewer.scene.globe.ellipsoid);
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
  label: PortalLabel,
  windowPosition: Cesium.Cartesian2,
  distance: number,
): PortalLabelEntityScreenBounds {
  const anchorY = windowPosition.y + getPortalLabelEntityPixelOffsetY(distance);

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
