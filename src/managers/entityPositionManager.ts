/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";

const LOG_TAG = "EntityPositionManager";

// Raise the portal up the 3D tiles a bit
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Inexpensive baseline terrain height before the heavier Google 3D scene-height samples.
const GOOGLE_WORLD_TERRAIN_SAMPLE_LEVEL = 11;
const GOOGLE_WORLD_TERRAIN_SAMPLE_BATCH_SIZE = 1024;
const GOOGLE_WORLD_TERRAIN_BATCH_DELAY_MS = 10;

// Quick height sampling from currently rendered Google 3D Tiles.
const GOOGLE_RENDERED_SAMPLE_BATCH_SIZE = 256;
const GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS = 50;

// Slower Google 3D Tiles sampling that resolves the best available height and is cached.
const GOOGLE_MOST_DETAILED_SAMPLE_DELAY_MS = 1000;
const GOOGLE_MOST_DETAILED_SAMPLE_BATCH_SIZE = 64;

// Height quality progresses from the synchronous placeholder to final cached height.
type HeightQuality = "ellipsoid" | "worldTerrain" | "rendered" | "mostDetailed";

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
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly positionEntriesByKey = new Map<string, EntityPositionEntry>();
  private readonly refreshableHeightKeys = new Set<string>();
  private readonly worldTerrainQueuedKeys = new Set<string>();
  private readonly renderedHeightQueuedKeys = new Set<string>();
  private readonly mostDetailedHeightQueuedKeys = new Set<string>();
  private readonly callbacksByKey = new Map<string, Set<EntityPositionCallback>>();
  private worldTerrainSamplingScheduled = false;
  private renderedHeightSamplingScheduled = false;
  private renderedHeightSamplingTimeout: number | undefined;
  private mostDetailedHeightSamplingInProgress = false;
  private mostDetailedHeightSamplingScheduled = false;
  private mostDetailedHeightSamplingTimeout: number | undefined;
  private cameraMoving = false;
  private heightSamplingGeneration = 0;
  private readonly worldTerrainProviderPromise: Promise<Cesium.TerrainProvider | undefined> | undefined;

  constructor(private readonly viewer: Cesium.Viewer) {
    if (!this.useGoogle3dTiles) return;

    this.worldTerrainProviderPromise = Cesium.createWorldTerrainAsync()
      .catch(() => {
        return undefined;
      });

    viewer.camera.moveStart.addEventListener(() => {
      this.cameraMoving = true;
      this.heightSamplingGeneration++;
      this.worldTerrainQueuedKeys.clear();
      this.renderedHeightQueuedKeys.clear();
      this.mostDetailedHeightQueuedKeys.clear();
      this.cancelRenderedSample();
      this.cancelDetailedSample();
    });

    viewer.camera.moveEnd.addEventListener(() => {
      this.cameraMoving = false;
      this.scheduleWorldTerrain();
      this.scheduleRenderedHeights();
      this.scheduleDetailedHeights();
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
      this.refreshableHeightKeys.add(key);
    }

    this.queueHeightSample(entry);
    return entry.position;
  }

  public setOnCoordinatePositionChangedCallback(data: EntityCoordinates, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.callbacksByKey.get(key) ?? new Set<EntityPositionCallback>();
    callbacks.add(callback);
    this.callbacksByKey.set(key, callbacks);
  }

  public unsetOnCoordinatePositionChangedCallback(data: EntityCoordinates, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.callbacksByKey.get(key);
    if (!callbacks) return;

    callbacks.delete(callback);
    if (callbacks.size === 0) this.callbacksByKey.delete(key);
  }

  public refreshTerrainPositions(): void {
    // Tile idle events can be noisy; only revisit positions that have not reached most-detailed height.
    if (this.refreshableHeightKeys.size === 0) return;

    this.heightSamplingGeneration++;
    Array.from(this.refreshableHeightKeys).forEach((key) => {
      const entry = this.positionEntriesByKey.get(key);
      if (!entry || entry.heightQuality === "mostDetailed") {
        this.refreshableHeightKeys.delete(key);
        return;
      }

      entry.heightSamplingVersion = -1;
      this.queueHeightSample(entry);
    });
  }

  public invalidateTerrainPositions(): void {
    this.heightSamplingGeneration++;
    this.refreshableHeightKeys.clear();
    this.worldTerrainQueuedKeys.clear();
    this.renderedHeightQueuedKeys.clear();
    this.cancelRenderedSample();
    this.cancelDetailedSample();
    this.mostDetailedHeightQueuedKeys.clear();
    this.positionEntriesByKey.forEach((entry) => {
      entry.heightQuality = "ellipsoid";
      entry.heightSamplingVersion = -1;
      this.refreshableHeightKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
      this.queueHeightSample(entry);
    });
    logManager.debug(LOG_TAG, "Height cache reset");
  }

  public hasRefreshableTerrainPositions(): boolean {
    return this.refreshableHeightKeys.size > 0;
  }

  private queueHeightSample(entry: EntityPositionEntry): void {
    if (entry.heightQuality === "mostDetailed") return;
    if (entry.heightSamplingVersion === this.heightSamplingGeneration) return;

    // The generation prevents stale async samples from overwriting newer height results.
    entry.heightSamplingVersion = this.heightSamplingGeneration;
    if (this.useGoogle3dTiles && entry.heightQuality === "ellipsoid") {
      this.worldTerrainQueuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
      this.scheduleWorldTerrain();
      return;
    }

    this.queueRenderedHeight(entry);
  }

  private queueRenderedHeight(entry: EntityPositionEntry): void {
    this.renderedHeightQueuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
    this.scheduleRenderedHeights();
  }

  private queueDetailedHeights(entries: EntityPositionEntry[]): void {
    if (!this.viewer.scene.sampleHeightSupported) return;
    entries.forEach((entry) => {
      if (entry.heightQuality === "mostDetailed") return;
      this.mostDetailedHeightQueuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));
    });
    this.scheduleDetailedHeights();
  }

  private scheduleWorldTerrain(): void {
    if (this.worldTerrainSamplingScheduled) return;
    if (this.useGoogle3dTiles && this.cameraMoving) return;

    this.worldTerrainSamplingScheduled = true;
    window.setTimeout(() => this.flushWorldTerrainQueue(), GOOGLE_WORLD_TERRAIN_BATCH_DELAY_MS);
  }

  private scheduleRenderedHeights(delayMs = 0): void {
    if (this.renderedHeightSamplingScheduled) return;
    if (this.useGoogle3dTiles && this.cameraMoving) return;

    this.renderedHeightSamplingScheduled = true;
    this.renderedHeightSamplingTimeout = window.setTimeout(() => this.flushRenderedHeightQueue(), delayMs);
  }

  private scheduleDetailedHeights(): void {
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

  private cancelRenderedSample(): void {
    if (this.renderedHeightSamplingTimeout === undefined) return;

    window.clearTimeout(this.renderedHeightSamplingTimeout);
    this.renderedHeightSamplingTimeout = undefined;
    this.renderedHeightSamplingScheduled = false;
  }

  private cancelDetailedSample(): void {
    if (this.mostDetailedHeightSamplingTimeout === undefined) return;

    window.clearTimeout(this.mostDetailedHeightSamplingTimeout);
    this.mostDetailedHeightSamplingTimeout = undefined;
    this.mostDetailedHeightSamplingScheduled = false;
  }

  private flushWorldTerrainQueue(): void {
    this.worldTerrainSamplingScheduled = false;

    const keys = takeHeightBatch(this.worldTerrainQueuedKeys, GOOGLE_WORLD_TERRAIN_SAMPLE_BATCH_SIZE);
    if (keys.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const entries = keys
      .map((key) => this.positionEntriesByKey.get(key))
      .filter((entry): entry is EntityPositionEntry => !!entry && entry.heightSamplingVersion === batchHeightSamplingGeneration);
    if (entries.length === 0) {
      if (this.worldTerrainQueuedKeys.size > 0) this.scheduleWorldTerrain();
      return;
    }

    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));
    this.sampleGoogleWorldTerrainHeights(entries, cartographics, batchHeightSamplingGeneration);
    if (this.worldTerrainQueuedKeys.size > 0) this.scheduleWorldTerrain();
  }

  private flushRenderedHeightQueue(): void {
    this.renderedHeightSamplingScheduled = false;
    this.renderedHeightSamplingTimeout = undefined;

    const keys = this.useGoogle3dTiles
      ? takeHeightBatch(this.renderedHeightQueuedKeys, GOOGLE_RENDERED_SAMPLE_BATCH_SIZE)
      : Array.from(this.renderedHeightQueuedKeys);
    if (!this.useGoogle3dTiles) this.renderedHeightQueuedKeys.clear();
    if (keys.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const entries = keys
      .map((key) => this.positionEntriesByKey.get(key))
      .filter((entry): entry is EntityPositionEntry => !!entry && entry.heightSamplingVersion === batchHeightSamplingGeneration);
    if (entries.length === 0) {
      if (this.useGoogle3dTiles && this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeights(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      return;
    }

    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));

    if (this.useGoogle3dTiles) {
      this.sampleGoogleRenderedHeights(entries, cartographics, batchHeightSamplingGeneration);
      if (this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeights(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      return;
    }

    const terrainProvider = this.viewer.terrainProvider;
    if (!terrainProvider.availability) {
      entries.forEach((entry, index) => this.useRenderedTerrainHeight(entry, cartographics[index], batchHeightSamplingGeneration));
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
        entries.forEach((entry, index) => this.useRenderedTerrainHeight(entry, cartographics[index], batchHeightSamplingGeneration));
      });
  }

  private flushMostDetailedHeightQueue(): void {
    if (this.cameraMoving || this.mostDetailedHeightSamplingInProgress || this.mostDetailedHeightQueuedKeys.size === 0) return;

    const entries = takeDetailedBatch(this.mostDetailedHeightQueuedKeys, this.positionEntriesByKey);
    if (entries.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));
    let mostDetailedSample: Promise<(Cesium.Cartographic | undefined)[]>;

    try {
      mostDetailedSample = this.viewer.scene.sampleHeightMostDetailed(cartographics);
    } catch {
      logManager.debug(LOG_TAG, "Detailed heights failed to load");
      return;
    }

    this.mostDetailedHeightSamplingInProgress = true;
    mostDetailedSample
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.cameraMoving) return;

        entries.forEach((entry, index) => {
          const sampled = sampledPositions[index];
          if (!sampled || sampled.height === undefined) return;
          this.updateEntry(entry, getTerrainPosition(
            sampled.longitude,
            sampled.latitude,
            sampled.height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
          ), "mostDetailed");
        });

        this.logQueueStatus();
      })
      .catch(() => {
        logManager.debug(LOG_TAG, "Detailed heights failed to load");
      })
      .finally(() => {
        this.mostDetailedHeightSamplingInProgress = false;
        this.scheduleDetailedHeights();
      });
  }

  private sampleGoogleWorldTerrainHeights(entries: EntityPositionEntry[], cartographics: Cesium.Cartographic[], batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

    const worldTerrainProviderPromise = this.worldTerrainProviderPromise;
    if (!worldTerrainProviderPromise) {
      entries.forEach((entry) => this.queueRenderedHeight(entry));
      return;
    }

    worldTerrainProviderPromise
      .then((terrainProvider) => {
        if (!terrainProvider) return undefined;
        return Cesium.sampleTerrain(terrainProvider, GOOGLE_WORLD_TERRAIN_SAMPLE_LEVEL, cartographics);
      })
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

        sampledPositions?.forEach((sampled, index) => {
          if (sampled.height === undefined) return;

          this.updateEntry(entries[index], getTerrainPosition(
            sampled.longitude,
            sampled.latitude,
            sampled.height,
          ), "worldTerrain");
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

        entries.forEach((entry) => this.queueRenderedHeight(entry));
      });
  }

  private sampleGoogleRenderedHeights(entries: EntityPositionEntry[], cartographics: Cesium.Cartographic[], batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

    entries.forEach((entry, index) => {
      const cartographic = cartographics[index];
      const height = sampleRenderedGoogleHeight(this.viewer.scene, cartographic);
      if (height === undefined) return;

      this.updateEntry(entry, getTerrainPosition(
        cartographic.longitude,
        cartographic.latitude,
        height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
      ), "rendered");
    });

    this.queueDetailedHeights(entries);
    this.logQueueStatus();
  }

  private useRenderedTerrainHeight(entry: EntityPositionEntry, cartographic: Cesium.Cartographic, batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration) return;

    const height = this.viewer.scene.globe.getHeight(cartographic) ?? 0;
    this.updateEntry(entry, getTerrainPosition(cartographic.longitude, cartographic.latitude, height), "rendered");
  }

  private updateEntry(entry: EntityPositionEntry, position: Cesium.Cartesian3, heightQuality: HeightQuality): void {
    entry.heightQuality = heightQuality;
    const key = getEntityPositionKey(entry.latE6, entry.lngE6);
    // Rendered heights are provisional; most-detailed heights are final until the terrain source changes.
    if (heightQuality === "mostDetailed") {
      this.refreshableHeightKeys.delete(key);
    } else {
      this.refreshableHeightKeys.add(key);
    }

    if (Cesium.Cartesian3.equals(entry.position, position)) return;

    entry.position = position;
    this.callbacksByKey.get(key)?.forEach(callback => callback(entry.latE6, entry.lngE6, position));
    this.viewer.scene.requestRender();
  }

  private logQueueStatus(): void {
    if (this.renderedHeightQueuedKeys.size > 0 && this.mostDetailedHeightQueuedKeys.size > 0) {
      logManager.debug(LOG_TAG, `Loading ${this.renderedHeightQueuedKeys.size} rendered heights and ${this.mostDetailedHeightQueuedKeys.size} detailed heights`);
    } else if (this.renderedHeightQueuedKeys.size > 0) {
      logManager.debug(LOG_TAG, `Loading ${this.renderedHeightQueuedKeys.size} rendered heights`);
    } else if (this.mostDetailedHeightQueuedKeys.size > 0) {
      logManager.debug(LOG_TAG, `Loading ${this.mostDetailedHeightQueuedKeys.size} detailed heights`);
    } else {
      logManager.debug(LOG_TAG, "Loaded all terrain positions");
    }
  }
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function takeHeightBatch(
  queuedHeightKeys: Set<string>,
  limit: number,
): string[] {
  const batch: string[] = [];

  for (const key of queuedHeightKeys) {
    queuedHeightKeys.delete(key);
    batch.push(key);
    if (batch.length >= limit) break;
  }

  return batch;
}

function takeDetailedBatch(
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
      logManager.debug(LOG_TAG, "Rendered heights failed to load");
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
