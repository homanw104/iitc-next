/**
 * Selects the portal labels that can be visible without overlapping.
 *
 * The flow is intentionally staged: collect screen-space candidates from the
 * current view, sort them by display priority, then accept candidates into a
 * grid so overlap checks only compare nearby labels. Terrain/rendered-depth
 * visibility checks are sliced as background work because they can be
 * comparatively expensive on dense views.
 */

import * as Cesium from "cesium";
import {
  PORTAL_LABEL_VISIBLE_OPACITY,
  getPortalLabelFadeTargetOpacity,
  getPortalLabelPixelOffsetY,
} from "./portalLabelLayout";
import type { PortalLabel, PortalLabelScreenBounds } from "./portalLabelTypes";
import { isPortalLabelPositionVisible } from "./portalLabelVisibility";

const PORTAL_LABEL_OVERLAP_PADDING_PX = 24;
const PORTAL_LABEL_OVERLAP_HIDE_HYSTERESIS_PX = 8;
const PORTAL_LABEL_OVERLAP_GRID_CELL_SIZE_PX = 128;
const PORTAL_LABEL_OVERLAP_MOVING_SLICE_MS = 1.5;
const PORTAL_LABEL_OVERLAP_IDLE_SLICE_MS = 4;
const PORTAL_LABEL_OVERLAP_YIELD_TIMEOUT_MS = 16;
const PORTAL_LABEL_VIEW_RECTANGLE_MAX_PITCH = Cesium.Math.toRadians(-30);

const windowPositionScratch = new Cesium.Cartesian2();
const cartographicScratch = new Cesium.Cartographic();
const clampedViewCameras = new WeakMap<Cesium.Scene, Cesium.Camera>();

interface PortalLabelOverlapCandidate {
  guid: string;
  position: Cesium.Cartesian3;
  windowPosition: Cesium.Cartesian2;
  bounds: PortalLabelScreenBounds;
  rejectionInsetPx: number;
  isCurrentlyVisible: boolean;
  firstShownAt: number | undefined;
  linkCount: number;
  level: number;
  distanceToCamera: number;
}

type AcceptedCandidateGrid = Map<string, PortalLabelOverlapCandidate[]>;

interface PortalLabelOverlapRefreshOptions {
  isCameraMoving?: () => boolean;
}

interface PortalLabelOverlapWorkScheduler {
  shouldYield(): boolean;
  waitForNextSlice(): Promise<void>;
}

export async function getNonOverlappingPortalLabelGuids(
  viewer: Cesium.Viewer,
  labels: Map<string, PortalLabel>,
  time: Cesium.JulianDate,
  shouldContinue: () => boolean = () => true,
  options: PortalLabelOverlapRefreshOptions = {},
): Promise<Set<string>> {
  const scheduler = createPortalLabelOverlapWorkScheduler(options);
  const candidates = await collectPortalLabelOverlapCandidates(viewer, labels, time, shouldContinue, scheduler);
  if (!candidates) return new Set<string>();

  if (scheduler.shouldYield()) await scheduler.waitForNextSlice();
  if (!shouldContinue()) return new Set<string>();

  candidates.sort(comparePortalLabelOverlapCandidates);

  if (scheduler.shouldYield()) await scheduler.waitForNextSlice();
  if (!shouldContinue()) return new Set<string>();

  return acceptNonOverlappingPortalLabelGuids(viewer, candidates, shouldContinue, scheduler);
}

async function collectPortalLabelOverlapCandidates(
  viewer: Cesium.Viewer,
  labels: Map<string, PortalLabel>,
  time: Cesium.JulianDate,
  shouldContinue: () => boolean,
  scheduler: PortalLabelOverlapWorkScheduler,
): Promise<PortalLabelOverlapCandidate[] | undefined> {
  const candidates: PortalLabelOverlapCandidate[] = [];
  const viewRectangle = getVisibleLabelViewRectangle(viewer);

  for (const [guid, label] of labels) {
    if (!shouldContinue()) return undefined;

    if (!label.isFallbackPosition) {
      const labelPosition = label.position;
      if (labelPosition && isLabelPositionInViewRectangle(viewer, labelPosition, viewRectangle)) {
        const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          labelPosition,
          windowPositionScratch,
        );

        if (windowPosition) {
          const distanceToCamera = Cesium.Cartesian3.distance(viewer.camera.positionWC, labelPosition);
          const bounds = getLabelScreenBounds(label, windowPosition, distanceToCamera);

          if (areScreenBoundsInCanvas(bounds, viewer.scene.canvas)) {
            const isCurrentlyVisible = isLabelCurrentlyVisible(label);
            candidates.push({
              guid,
              position: labelPosition,
              windowPosition: Cesium.Cartesian2.clone(windowPosition),
              bounds,
              rejectionInsetPx: isCurrentlyVisible ? PORTAL_LABEL_OVERLAP_HIDE_HYSTERESIS_PX : 0,
              isCurrentlyVisible,
              firstShownAt: label.firstShownAt,
              linkCount: label.linkCount,
              level: label.data.level ?? 0,
              distanceToCamera,
            },);
          }
        }
      }
    }

    if (scheduler.shouldYield()) {
      await scheduler.waitForNextSlice();
      if (!shouldContinue()) return undefined;
    }
  }

  return candidates;
}

async function acceptNonOverlappingPortalLabelGuids(
  viewer: Cesium.Viewer,
  candidates: PortalLabelOverlapCandidate[],
  shouldContinue: () => boolean,
  scheduler: PortalLabelOverlapWorkScheduler,
): Promise<Set<string>> {
  const acceptedGuids = new Set<string>();
  const acceptedCandidateGrid: AcceptedCandidateGrid = new Map();
  for (const candidate of candidates) {
    if (!shouldContinue()) return acceptedGuids;

    if (scheduler.shouldYield()) {
      await scheduler.waitForNextSlice();
      if (!shouldContinue()) return acceptedGuids;
    }

    if (doesCandidateOverlapAcceptedLabels(candidate, acceptedCandidateGrid)) continue;

    if (scheduler.shouldYield()) {
      await scheduler.waitForNextSlice();
      if (!shouldContinue()) return acceptedGuids;
    }

    if (!isPortalLabelPositionVisible(viewer, candidate.position, candidate.windowPosition)) continue;

    acceptedGuids.add(candidate.guid);
    addAcceptedCandidateToGrid(candidate, acceptedCandidateGrid);
  }
  return acceptedGuids;
}

function createPortalLabelOverlapWorkScheduler(
  options: PortalLabelOverlapRefreshOptions,
): PortalLabelOverlapWorkScheduler {
  let sliceStartedAt = performance.now();

  return {
    shouldYield: () => performance.now() - sliceStartedAt >= getPortalLabelOverlapSliceMs(options),
    waitForNextSlice: async () => {
      await waitForBackgroundWork();
      sliceStartedAt = performance.now();
    },
  };
}

function getPortalLabelOverlapSliceMs(options: PortalLabelOverlapRefreshOptions): number {
  return options.isCameraMoving?.() === true ?
    PORTAL_LABEL_OVERLAP_MOVING_SLICE_MS :
    PORTAL_LABEL_OVERLAP_IDLE_SLICE_MS;
}

function waitForBackgroundWork(): Promise<void> {
  if (window.requestIdleCallback) {
    return new Promise((resolve) => window.requestIdleCallback(
      () => resolve(),
      { timeout: PORTAL_LABEL_OVERLAP_YIELD_TIMEOUT_MS },
    ),);
  }

  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function comparePortalLabelOverlapCandidates(
  a: PortalLabelOverlapCandidate,
  b: PortalLabelOverlapCandidate,
): number {
  return Number(b.isCurrentlyVisible) - Number(a.isCurrentlyVisible) ||
    compareFirstShownAt(a.firstShownAt, b.firstShownAt) ||
    b.linkCount - a.linkCount ||
    b.level - a.level ||
    a.distanceToCamera - b.distanceToCamera ||
    a.guid.localeCompare(b.guid);
}

function compareFirstShownAt(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  else if (a === undefined) return 1;
  else if (b === undefined) return -1;
  else return a - b;
}

function isLabelCurrentlyVisible(label: PortalLabel): boolean {
  return label.primitive?.show === true &&
    getPortalLabelFadeTargetOpacity(label) === PORTAL_LABEL_VISIBLE_OPACITY;
}

function getVisibleLabelViewRectangle(viewer: Cesium.Viewer): Cesium.Rectangle | undefined {
  const camera = viewer.camera;
  if (camera.pitch <= PORTAL_LABEL_VIEW_RECTANGLE_MAX_PITCH) {
    return camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  }

  const clampedCamera = getClampedViewCamera(viewer.scene);
  clampedCamera.frustum = camera.frustum.clone();
  clampedCamera.setView({
    destination: camera.positionWC,
    orientation: {
      heading: camera.heading,
      pitch: PORTAL_LABEL_VIEW_RECTANGLE_MAX_PITCH,
      roll: camera.roll,
    },
    endTransform: camera.transform,
  },);

  return clampedCamera.computeViewRectangle(viewer.scene.globe.ellipsoid);
}

function getClampedViewCamera(scene: Cesium.Scene): Cesium.Camera {
  let camera = clampedViewCameras.get(scene);
  if (!camera) {
    camera = new Cesium.Camera(scene);
    clampedViewCameras.set(scene, camera);
  }

  return camera;
}

function isLabelPositionInViewRectangle(
  viewer: Cesium.Viewer,
  labelPosition: Cesium.Cartesian3,
  viewRectangle: Cesium.Rectangle | undefined,
): boolean {
  if (!viewRectangle) return true;

  const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(
    labelPosition,
    cartographicScratch,
  );
  return !!cartographic && Cesium.Rectangle.contains(viewRectangle, cartographic);
}

function getLabelScreenBounds(
  label: PortalLabel,
  windowPosition: Cesium.Cartesian2,
  distanceToCamera: number,
  padding = PORTAL_LABEL_OVERLAP_PADDING_PX,
): PortalLabelScreenBounds {
  const anchorY = windowPosition.y + getPortalLabelPixelOffsetY(distanceToCamera);

  return {
    left: windowPosition.x - label.screenBoxWidth / 2 - padding,
    top: anchorY - label.screenBoxHeight - padding,
    right: windowPosition.x + label.screenBoxWidth / 2 + padding,
    bottom: anchorY + padding,
  };
}

function areScreenBoundsInCanvas(
  bounds: PortalLabelScreenBounds,
  canvas: HTMLCanvasElement,
): boolean {
  return bounds.right >= 0 &&
    bounds.left <= canvas.clientWidth &&
    bounds.bottom >= 0 &&
    bounds.top <= canvas.clientHeight;
}

function doesCandidateOverlapAcceptedLabels(
  candidate: PortalLabelOverlapCandidate,
  acceptedCandidateGrid: AcceptedCandidateGrid,
): boolean {
  const checkedAcceptedGuids = new Set<string>();
  const bounds = candidate.bounds;
  const range = getScreenBoundsGridRange(bounds);

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const acceptedCandidates = acceptedCandidateGrid.get(getScreenBoundsGridKey(x, y));
      if (!acceptedCandidates) continue;

      for (const acceptedCandidate of acceptedCandidates) {
        if (checkedAcceptedGuids.has(acceptedCandidate.guid)) continue;

        checkedAcceptedGuids.add(acceptedCandidate.guid);
        if (doInsetScreenBoundsOverlap(bounds, acceptedCandidate.bounds, acceptedCandidate.rejectionInsetPx)) return true;
      }
    }
  }

  return false;
}

function doInsetScreenBoundsOverlap(
  a: PortalLabelScreenBounds,
  b: PortalLabelScreenBounds,
  aInsetPx: number,
): boolean {
  return a.left + aInsetPx < b.right &&
    a.right - aInsetPx > b.left &&
    a.top + aInsetPx < b.bottom &&
    a.bottom - aInsetPx > b.top;
}

function addAcceptedCandidateToGrid(
  candidate: PortalLabelOverlapCandidate,
  acceptedCandidateGrid: AcceptedCandidateGrid,
): void {
  const range = getScreenBoundsGridRange(candidate.bounds);

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const key = getScreenBoundsGridKey(x, y);
      const candidates = acceptedCandidateGrid.get(key) ?? [];
      candidates.push(candidate);
      acceptedCandidateGrid.set(key, candidates);
    }
  }
}

function getScreenBoundsGridRange(bounds: PortalLabelScreenBounds): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number
} {
  return {
    minX: Math.floor(bounds.left / PORTAL_LABEL_OVERLAP_GRID_CELL_SIZE_PX),
    maxX: Math.floor(bounds.right / PORTAL_LABEL_OVERLAP_GRID_CELL_SIZE_PX),
    minY: Math.floor(bounds.top / PORTAL_LABEL_OVERLAP_GRID_CELL_SIZE_PX),
    maxY: Math.floor(bounds.bottom / PORTAL_LABEL_OVERLAP_GRID_CELL_SIZE_PX),
  };
}

function getScreenBoundsGridKey(x: number, y: number): string {
  return `${x},${y}`;
}
