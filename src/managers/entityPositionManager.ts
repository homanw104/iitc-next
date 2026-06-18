/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";

const LOG_TAG = "EntityPositionManager";

// Raise the portal up the 3D tiles a bit
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Quick height sampling from currently rendered Google 3D Tiles.
const GOOGLE_RENDERED_SAMPLE_BATCH_SIZE = 256;
const GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS = 50;

// Slower Google 3D Tiles sampling that resolves the best available height and is cached.
const GOOGLE_MOST_DETAILED_SAMPLE_DELAY_MS = 1500;
const GOOGLE_MOST_DETAILED_SAMPLE_BATCH_SIZE = 64;

// Three levels of height sampling from the least detailed (cheapest) to the most detailed (resource-intensive)
type HeightQuality = "ellipsoid" | "rendered" | "mostDetailed";

export interface EntityCoordinates {
  latE6: number;
  lngE6: number;
}

export type EntityPositionCallback = (latE6: number, lngE6: number, position: Cesium.Cartesian3) => void;

interface EntityPositionEntry extends EntityCoordinates {
  position: Cesium.Cartesian3;
  heightSamplingVersion: number;
  heightQuality: HeightQuality;
}

export class EntityPositionManager {
  private readonly positionEntriesByKey = new Map<string, EntityPositionEntry>();
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly renderedHeightQueuedKeys = new Set<string>();
  private readonly mostDetailedHeightQueuedKeys = new Set<string>();
  private callbacks: EntityPositionCallback[] = [];
  private renderedHeightSamplingScheduled = false;
  private renderedHeightSamplingTimeout: number | undefined;
  private mostDetailedHeightSamplingInProgress = false;
  private mostDetailedHeightSamplingScheduled = false;
  private mostDetailedHeightSamplingTimeout: number | undefined;
  private cameraMoving = false;
  private heightSamplingGeneration = 0;

  constructor(private readonly viewer: Cesium.Viewer) {
    if (!this.useGoogle3dTiles) return;

    viewer.camera.moveStart.addEventListener(() => {
      this.cameraMoving = true;
      this.heightSamplingGeneration++;
      this.renderedHeightQueuedKeys.clear();
      this.clearRenderedHeightSamplingTimeout();
      this.clearMostDetailedHeightSamplingTimeout();
      this.mostDetailedHeightQueuedKeys.clear();
    });

    viewer.camera.moveEnd.addEventListener(() => {
      this.cameraMoving = false;
      this.scheduleRenderedHeightSampling();
      this.scheduleMostDetailedHeightSampling();
    });
  }

  public getPosition(data: EntityCoordinates): Cesium.Cartesian3 {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    let entry = this.positionEntriesByKey.get(key);

    if (!entry) {
      entry = {
        latE6: data.latE6,
        lngE6: data.lngE6,
        position: getEllipsoidPosition(data.latE6, data.lngE6),
        heightSamplingVersion: -1,
        heightQuality: "ellipsoid",
      };
      this.positionEntriesByKey.set(key, entry);
    }

    this.queueRenderedHeightSampling(entry);
    return entry.position;
  }

  public setOnPositionChangedCallback(callback: EntityPositionCallback): void {
    this.callbacks.push(callback);
  }

  public unsetOnPositionChangedCallback(callback: EntityPositionCallback): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  public refreshTerrainPositions(): void {
    this.heightSamplingGeneration++;
    let queuedCount = 0;
    this.positionEntriesByKey.forEach((entry) => {
      if (entry.heightQuality === "mostDetailed") return;

      entry.heightSamplingVersion = -1;
      this.queueRenderedHeightSampling(entry);
      queuedCount++;
    });
    logManager.debug(LOG_TAG, `Height refresh: ${queuedCount} queued`);
  }

  public invalidateTerrainPositions(): void {
    this.heightSamplingGeneration++;
    this.renderedHeightQueuedKeys.clear();
    this.clearRenderedHeightSamplingTimeout();
    this.clearMostDetailedHeightSamplingTimeout();
    this.mostDetailedHeightQueuedKeys.clear();
    this.positionEntriesByKey.forEach((entry) => {
      entry.heightQuality = "ellipsoid";
      entry.heightSamplingVersion = -1;
      this.queueRenderedHeightSampling(entry);
    });
    logManager.debug(LOG_TAG, "Height cache reset");
  }

  private queueRenderedHeightSampling(entry: EntityPositionEntry): void {
    if (entry.heightQuality === "mostDetailed") return;
    if (entry.heightSamplingVersion === this.heightSamplingGeneration) return;

    entry.heightSamplingVersion = this.heightSamplingGeneration;
    this.renderedHeightQueuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
    this.scheduleRenderedHeightSampling();
  }

  private scheduleRenderedHeightSampling(delayMs = 0): void {
    if (this.renderedHeightSamplingScheduled) return;
    if (this.useGoogle3dTiles && this.cameraMoving) return;

    this.renderedHeightSamplingScheduled = true;
    this.renderedHeightSamplingTimeout = window.setTimeout(() => this.flushRenderedHeightQueue(), delayMs);
  }

  private clearRenderedHeightSamplingTimeout(): void {
    if (this.renderedHeightSamplingTimeout === undefined) return;

    window.clearTimeout(this.renderedHeightSamplingTimeout);
    this.renderedHeightSamplingTimeout = undefined;
    this.renderedHeightSamplingScheduled = false;
  }

  private flushRenderedHeightQueue(): void {
    this.renderedHeightSamplingScheduled = false;
    this.renderedHeightSamplingTimeout = undefined;

    const keys = this.useGoogle3dTiles
      ? takeKeys(this.renderedHeightQueuedKeys, GOOGLE_RENDERED_SAMPLE_BATCH_SIZE)
      : Array.from(this.renderedHeightQueuedKeys);
    if (!this.useGoogle3dTiles) this.renderedHeightQueuedKeys.clear();
    if (keys.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const entries = keys
      .map((key) => this.positionEntriesByKey.get(key))
      .filter((entry): entry is EntityPositionEntry => !!entry && entry.heightSamplingVersion === batchHeightSamplingGeneration);
    if (entries.length === 0) {
      if (this.useGoogle3dTiles && this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeightSampling(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      return;
    }

    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));

    if (this.useGoogle3dTiles) {
      this.sampleGoogleRenderedHeights(entries, cartographics, batchHeightSamplingGeneration);
      if (this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeightSampling(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      return;
    }

    const terrainProvider = this.viewer.terrainProvider;
    if (!terrainProvider.availability) {
      entries.forEach((entry, index) => this.updateFromRenderedTerrain(entry, cartographics[index], batchHeightSamplingGeneration));
      return;
    }

    Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;
        entries.forEach((entry, index) => {
          const sampled = sampledPositions[index];
          this.updateEntry(entry, getTerrainPosition(sampled.longitude, sampled.latitude, sampled.height), "mostDetailed");
        });
      })
      .catch(() => {
        logManager.warn(LOG_TAG, "Terrain height failed");
        entries.forEach((entry, index) => this.updateFromRenderedTerrain(entry, cartographics[index], batchHeightSamplingGeneration));
      });
  }

  private sampleGoogleRenderedHeights(entries: EntityPositionEntry[], cartographics: Cesium.Cartographic[], batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

    let sampledCount = 0;
    entries.forEach((entry, index) => {
      const cartographic = cartographics[index];
      const height = sampleRenderedGoogleHeight(this.viewer.scene, cartographic);
      if (height === undefined) return;

      sampledCount++;
      this.updateEntry(entry, getTerrainPosition(
        cartographic.longitude,
        cartographic.latitude,
        height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
      ), "rendered");
    });
    logManager.debug(LOG_TAG, `Rendered heights: ${sampledCount}/${entries.length}`);

    this.queueMostDetailedHeightSampling(entries);
  }

  private updateFromRenderedTerrain(entry: EntityPositionEntry, cartographic: Cesium.Cartographic, batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

    const height = this.viewer.scene.globe.getHeight(cartographic) ?? 0;
    this.updateEntry(entry, getTerrainPosition(cartographic.longitude, cartographic.latitude, height), "rendered");
  }

  private updateEntry(entry: EntityPositionEntry, position: Cesium.Cartesian3, heightQuality: HeightQuality): void {
    entry.heightQuality = heightQuality;
    if (Cesium.Cartesian3.equals(entry.position, position)) return;

    entry.position = position;
    this.callbacks.forEach(callback => callback(entry.latE6, entry.lngE6, position));
    this.viewer.scene.requestRender();
  }

  private queueMostDetailedHeightSampling(entries: EntityPositionEntry[]): void {
    if (!this.viewer.scene.sampleHeightSupported) return;

    entries.forEach((entry) => {
      if (entry.heightQuality === "mostDetailed") return;

      this.mostDetailedHeightQueuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
    });
    this.scheduleMostDetailedHeightSampling();
  }

  private scheduleMostDetailedHeightSampling(): void {
    if (
      this.cameraMoving ||
      this.mostDetailedHeightSamplingInProgress ||
      this.mostDetailedHeightSamplingScheduled ||
      this.mostDetailedHeightQueuedKeys.size === 0
    ) {
      return;
    }

    this.mostDetailedHeightSamplingScheduled = true;
    this.mostDetailedHeightSamplingTimeout = window.setTimeout(() => {
      this.mostDetailedHeightSamplingScheduled = false;
      this.mostDetailedHeightSamplingTimeout = undefined;
      this.flushMostDetailedHeightQueue();
    }, GOOGLE_MOST_DETAILED_SAMPLE_DELAY_MS);
  }

  private clearMostDetailedHeightSamplingTimeout(): void {
    if (this.mostDetailedHeightSamplingTimeout === undefined) return;

    window.clearTimeout(this.mostDetailedHeightSamplingTimeout);
    this.mostDetailedHeightSamplingTimeout = undefined;
    this.mostDetailedHeightSamplingScheduled = false;
  }

  private flushMostDetailedHeightQueue(): void {
    if (this.cameraMoving || this.mostDetailedHeightSamplingInProgress || this.mostDetailedHeightQueuedKeys.size === 0) return;

    const entries = takeMostDetailedHeightBatch(this.mostDetailedHeightQueuedKeys, this.positionEntriesByKey);
    if (entries.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));
    let mostDetailedSample: Promise<(Cesium.Cartographic | undefined)[]>;

    try {
      mostDetailedSample = this.viewer.scene.sampleHeightMostDetailed(cartographics);
    } catch {
      logManager.debug(LOG_TAG, "Detailed heights failed");
      return;
    }

    this.mostDetailedHeightSamplingInProgress = true;
    logManager.debug(LOG_TAG, "Detailed heights running");
    mostDetailedSample
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.cameraMoving) return;

        let sampledCount = 0;
        entries.forEach((entry, index) => {
          const sampled = sampledPositions[index];
          if (!sampled || sampled.height === undefined) return;

          sampledCount++;
          this.updateEntry(entry, getTerrainPosition(
            sampled.longitude,
            sampled.latitude,
            sampled.height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
          ), "mostDetailed");
        });
        logManager.debug(LOG_TAG, `Detailed heights: ${sampledCount}/${entries.length}`);
      })
      .catch(() => {
        logManager.debug(LOG_TAG, "Detailed heights failed");
      })
      .finally(() => {
        this.mostDetailedHeightSamplingInProgress = false;
        this.scheduleMostDetailedHeightSampling();
      });
  }
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function takeKeys(keys: Set<string>, limit: number): string[] {
  const batch: string[] = [];

  for (const key of keys) {
    keys.delete(key);
    batch.push(key);
    if (batch.length >= limit) break;
  }

  return batch;
}

function takeMostDetailedHeightBatch(
  queuedHeightKeys: Set<string>,
  entries: Map<string, EntityPositionEntry>,
): EntityPositionEntry[] {
  const batch: EntityPositionEntry[] = [];

  for (const key of queuedHeightKeys) {
    queuedHeightKeys.delete(key);

    const entry = entries.get(key);
    if (!entry || entry.heightQuality === "mostDetailed") continue;

    batch.push(entry);
    if (batch.length >= GOOGLE_MOST_DETAILED_SAMPLE_BATCH_SIZE) break;
  }

  return batch;
}

function getEllipsoidPosition(latE6: number, lngE6: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(lngE6 / 1e6, latE6 / 1e6);
}

function getTerrainPosition(longitude: number, latitude: number, height: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromRadians(longitude, latitude, height);
}

function sampleRenderedGoogleHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  if (scene.sampleHeightSupported) {
    try {
      return scene.sampleHeight(cartographic);
    } catch {
      logManager.debug(LOG_TAG, "Rendered heights failed");
    }
  }

  return getRenderedGoogleHeight(scene, cartographic);
}

function getRenderedGoogleHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return sceneWithGetHeight.getHeight(cartographic, Cesium.HeightReference.CLAMP_TO_3D_TILE);
}
