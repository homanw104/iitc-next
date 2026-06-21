/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";

const LOG_TAG = "EntityPositionManager";

// Raise the portal up the 3D tiles a bit
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Fast terrain-network sample used before an entity is first shown.
const WORLD_TERRAIN_SAMPLE_LEVEL = 11;

// Quick height sampling from currently rendered Google 3D Tiles.
const GOOGLE_RENDERED_SAMPLE_BATCH_SIZE = 32;
const GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS = 50;

// Slower Google 3D Tiles sampling that resolves the best available height and is cached.
const GOOGLE_MOST_DETAILED_SAMPLE_BATCH_SIZE = 32;
const GOOGLE_MOST_DETAILED_SAMPLE_DELAY_MS = 50;

// Height quality progresses from the world-terrain baseline to final cached height.
type HeightQuality = "worldTerrain" | "rendered" | "mostDetailed";

const HEIGHT_QUALITY_RANK: Record<HeightQuality, number> = {
  worldTerrain: 0,
  rendered: 1,
  mostDetailed: 2,
};

export interface EntityCoordinates {
  latE6: number;
  lngE6: number;
}

export type EntityPositionCallback = (latE6: number, lngE6: number, position: Cesium.Cartesian3) => void;

interface EntityPositionState extends EntityCoordinates {
  position: Cesium.Cartesian3;
  heightSamplingVersion: number;
  renderedHeightAttemptGeneration: number;
  heightQuality: HeightQuality;
}

export class EntityPositionManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly positionStatesByKey = new Map<string, EntityPositionState>();
  private readonly pendingPositionPromisesByKey = new Map<string, Promise<Cesium.Cartesian3>>();
  private readonly refreshableHeightKeys = new Set<string>();
  private readonly renderedHeightQueuedKeys = new Set<string>();
  private readonly renderedHeightSamplingKeys = new Set<string>();
  private readonly mostDetailedHeightQueuedKeys = new Set<string>();
  private readonly mostDetailedHeightSamplingKeys = new Set<string>();
  private readonly callbacksByKey = new Map<string, Set<EntityPositionCallback>>();
  private renderedHeightSamplingScheduled = false;
  private renderedHeightSamplingTimeout: number | undefined;
  private mostDetailedHeightSamplingInProgress = false;
  private mostDetailedHeightSamplingScheduled = false;
  private mostDetailedHeightSamplingTimeout: number | undefined;
  private cameraMoving = false;
  private interactionActive = false;
  private heightSamplingGeneration = 0;
  private queueStatusLoggingActive = false;
  private readonly worldTerrainProviderPromise: Promise<Cesium.TerrainProvider | undefined>;

  constructor(private readonly viewer: Cesium.Viewer) {
    this.worldTerrainProviderPromise = Cesium.createWorldTerrainAsync()
      .catch(() => undefined);

    viewer.camera.moveStart.addEventListener(() => {
      this.cameraMoving = true;
      this.heightSamplingGeneration++;
      this.cancelRenderedSample();
      this.cancelDetailedSample();
    });

    viewer.camera.moveEnd.addEventListener(() => {
      this.cameraMoving = false;
      this.resumeQueuedHeightSampling();
    });
  }

  public async getPosition(data: EntityCoordinates): Promise<Cesium.Cartesian3> {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const cachedPositionState = this.positionStatesByKey.get(key);
    if (cachedPositionState) return this.useCachedPosition(cachedPositionState);

    const position = await this.getInitialPosition(key, data);
    const positionState = this.positionStatesByKey.get(key) ?? this.createWorldTerrainPositionState(data, position);
    return this.useCachedPosition(positionState);
  }

  private useCachedPosition(positionState: EntityPositionState): Cesium.Cartesian3 {
    this.queueHeightSample(positionState);
    return positionState.position;
  }

  private getInitialPosition(key: string, data: EntityCoordinates): Promise<Cesium.Cartesian3> {
    const pendingPosition = this.pendingPositionPromisesByKey.get(key);
    if (pendingPosition) return pendingPosition;

    const position = this.getWorldTerrainPosition(data)
      .finally(() => this.pendingPositionPromisesByKey.delete(key));
    this.pendingPositionPromisesByKey.set(key, position);
    return position;
  }

  private createWorldTerrainPositionState(data: EntityCoordinates, position: Cesium.Cartesian3): EntityPositionState {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const positionState: EntityPositionState = {
      latE6: data.latE6,
      lngE6: data.lngE6,
      position: position,
      heightSamplingVersion: -1,
      renderedHeightAttemptGeneration: -1,
      heightQuality: "worldTerrain",
    };
    this.positionStatesByKey.set(key, positionState);
    this.refreshableHeightKeys.add(key);
    return positionState;
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

  public suppressHeightSampling(): void {
    if (this.interactionActive) return;

    this.interactionActive = true;
    this.cancelRenderedSample();
    this.cancelDetailedSample();
  }

  public resumeHeightSampling(): void {
    if (!this.interactionActive) return;

    this.interactionActive = false;
    this.resumeQueuedHeightSampling();
  }

  public refreshTerrainPositions(): boolean {
    if (this.isHeightSamplingSuppressed()) return false;

    // Tile idle events can be noisy. Reconcile unresolved positions without resetting
    // per-generation attempt markers, so background tile refreshes do not refill the
    // rendered-height queue every second while the camera is idle.
    if (this.refreshableHeightKeys.size === 0) return true;

    Array.from(this.refreshableHeightKeys).forEach((key) => {
      const positionState = this.positionStatesByKey.get(key);
      if (!positionState || positionState.heightQuality === "mostDetailed") {
        this.refreshableHeightKeys.delete(key);
        return;
      }

      this.queueHeightSample(positionState);
    });
    return true;
  }

  public invalidateTerrainPositions(): boolean {
    if (this.isHeightSamplingSuppressed()) return false;

    this.heightSamplingGeneration++;
    this.refreshableHeightKeys.clear();
    this.renderedHeightQueuedKeys.clear();
    this.renderedHeightSamplingKeys.clear();
    this.cancelRenderedSample();
    this.cancelDetailedSample();
    this.mostDetailedHeightQueuedKeys.clear();
    this.mostDetailedHeightSamplingKeys.clear();
    this.positionStatesByKey.forEach((positionState) => {
      positionState.heightQuality = "worldTerrain";
      positionState.heightSamplingVersion = -1;
      positionState.renderedHeightAttemptGeneration = -1;
      this.refreshableHeightKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6));
      this.refreshWorldTerrainPosition(positionState);
    });
    logManager.debug(LOG_TAG, "Height cache reset");
    return true;
  }

  public hasRefreshableTerrainPositions(): boolean {
    return this.refreshableHeightKeys.size > 0;
  }

  private queueHeightSample(positionState: EntityPositionState): void {
    if (positionState.heightQuality === "mostDetailed") return;

    if (this.useGoogle3dTiles && positionState.renderedHeightAttemptGeneration === this.heightSamplingGeneration) {
      this.queueDetailedHeights([positionState]);
      return;
    }

    this.queueRenderedHeight(positionState);
  }

  private queueRenderedHeight(positionState: EntityPositionState): void {
    if (positionState.heightQuality === "mostDetailed") return;
    // Rendered Google heights are tied to the current camera/tileset view. Try them
    // once per camera generation; detailed sampling can still finish the position.
    if (this.useGoogle3dTiles && positionState.renderedHeightAttemptGeneration === this.heightSamplingGeneration) return;

    const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
    if (this.renderedHeightQueuedKeys.has(key) || this.renderedHeightSamplingKeys.has(key)) return;
    this.renderedHeightQueuedKeys.add(key);
    this.scheduleRenderedHeights();
  }

  private queueDetailedHeights(positionStates: EntityPositionState[]): void {
    if (!this.viewer.scene.sampleHeightSupported) return;
    positionStates.forEach((positionState) => {
      if (positionState.heightQuality === "mostDetailed") return;
      const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
      if (this.mostDetailedHeightSamplingKeys.has(key)) return;
      this.mostDetailedHeightQueuedKeys.add(key);
    });
    this.scheduleDetailedHeights();
  }

  private scheduleRenderedHeights(delayMs = 0): void {
    if (this.renderedHeightSamplingScheduled) return;
    if (this.isHeightSamplingSuppressed()) return;

    this.renderedHeightSamplingScheduled = true;
    this.renderedHeightSamplingTimeout = window.setTimeout(() => this.flushRenderedHeightQueue(), delayMs);
  }

  private scheduleDetailedHeights(): void {
    if (
      this.isHeightSamplingSuppressed() ||
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

  private isHeightSamplingSuppressed(): boolean {
    return this.cameraMoving || this.interactionActive;
  }

  private resumeQueuedHeightSampling(): void {
    if (this.isHeightSamplingSuppressed()) return;

    // Camera moves advance the generation without discarding queue intent. Reconcile
    // from the durable refreshable set so positionStates attempted in the previous camera
    // generation get exactly one new rendered-height chance after the camera settles.
    this.refreshableHeightKeys.forEach((key) => {
      const positionState = this.positionStatesByKey.get(key);
      if (!positionState || positionState.heightQuality === "mostDetailed") {
        this.refreshableHeightKeys.delete(key);
        return;
      }

      this.queueHeightSample(positionState);
    });

    this.scheduleRenderedHeights();
    this.scheduleDetailedHeights();
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

  private flushRenderedHeightQueue(): void {
    this.renderedHeightSamplingScheduled = false;
    this.renderedHeightSamplingTimeout = undefined;
    if (this.isHeightSamplingSuppressed()) return;

    const keys = this.useGoogle3dTiles
      ? takeHeightBatch(this.renderedHeightQueuedKeys, GOOGLE_RENDERED_SAMPLE_BATCH_SIZE)
      : Array.from(this.renderedHeightQueuedKeys);
    if (!this.useGoogle3dTiles) this.renderedHeightQueuedKeys.clear();
    if (keys.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const positionStates = keys
      .map((key) => this.positionStatesByKey.get(key))
      .filter((positionState): positionState is EntityPositionState => {
        if (!positionState || positionState.heightQuality === "mostDetailed") return false;
        return !this.useGoogle3dTiles || positionState.renderedHeightAttemptGeneration !== batchHeightSamplingGeneration;
      });
    if (positionStates.length === 0) {
      if (this.useGoogle3dTiles && this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeights(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      return;
    }
    positionStates.forEach((positionState) => {
      positionState.heightSamplingVersion = batchHeightSamplingGeneration;
      if (this.useGoogle3dTiles) positionState.renderedHeightAttemptGeneration = batchHeightSamplingGeneration;
      this.renderedHeightSamplingKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6));
    });
    this.logQueueStartStatus();

    const cartographics = positionStates.map((positionState) => Cesium.Cartographic.fromDegrees(positionState.lngE6 / 1e6, positionState.latE6 / 1e6));

    if (this.useGoogle3dTiles) {
      this.sampleGoogleRenderedHeights(positionStates, cartographics, batchHeightSamplingGeneration);
      positionStates.forEach((positionState) => this.renderedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
      if (this.renderedHeightQueuedKeys.size > 0) {
        this.scheduleRenderedHeights(GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS);
      }
      this.logQueueStatus();
      return;
    }

    const terrainProvider = this.viewer.terrainProvider;
    if (!terrainProvider.availability) {
      positionStates.forEach((positionState, index) => this.useRenderedTerrainHeight(positionState, cartographics[index], batchHeightSamplingGeneration));
      positionStates.forEach((positionState) => this.renderedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
      this.logQueueStatus();
      return;
    }

    Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;
        positionStates.forEach((positionState, index) => {
          const sampled = sampledPositions[index];
          this.updatePositionState(positionState, getTerrainPosition(sampled.longitude, sampled.latitude, sampled.height), "mostDetailed");
        });
      })
      .catch(() => {
        if (this.isHeightSamplingSuppressed()) return;

        logManager.warn(LOG_TAG, "Terrain height failed");
        positionStates.forEach((positionState, index) => this.useRenderedTerrainHeight(positionState, cartographics[index], batchHeightSamplingGeneration));
      })
      .finally(() => {
        positionStates.forEach((positionState) => this.renderedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
        if (this.isHeightSamplingSuppressed()) {
          positionStates.forEach((positionState) => {
            positionState.heightSamplingVersion = -1;
            this.queueHeightSample(positionState);
          });
        }
        this.logQueueStatus();
      });
  }

  private flushMostDetailedHeightQueue(): void {
    if (this.isHeightSamplingSuppressed() || this.mostDetailedHeightSamplingInProgress || this.mostDetailedHeightQueuedKeys.size === 0) return;

    const positionStates = takeDetailedBatch(this.mostDetailedHeightQueuedKeys, this.positionStatesByKey);
    if (positionStates.length === 0) return;
    positionStates.forEach((positionState) => this.mostDetailedHeightSamplingKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
    this.logQueueStartStatus();

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const cartographics = positionStates.map((positionState) => Cesium.Cartographic.fromDegrees(positionState.lngE6 / 1e6, positionState.latE6 / 1e6));
    let mostDetailedSample: Promise<(Cesium.Cartographic | undefined)[]>;

    try {
      mostDetailedSample = this.viewer.scene.sampleHeightMostDetailed(cartographics);
    } catch {
      positionStates.forEach((positionState) => this.mostDetailedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
      logManager.debug(LOG_TAG, "Detailed heights failed to load");
      this.logQueueStatus();
      return;
    }

    this.mostDetailedHeightSamplingInProgress = true;
    mostDetailedSample
      .then((sampledPositions) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

        positionStates.forEach((positionState, index) => {
          const sampled = sampledPositions[index];
          if (!sampled || sampled.height === undefined) return;
          this.updatePositionState(positionState, getTerrainPosition(
            sampled.longitude,
            sampled.latitude,
            sampled.height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
          ), "mostDetailed");
        });
      })
      .catch(() => {
        logManager.debug(LOG_TAG, "Detailed heights failed to load");
      })
      .finally(() => {
        positionStates.forEach((positionState) => this.mostDetailedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6)));
        if (this.isHeightSamplingSuppressed()) {
          positionStates.forEach((positionState) => {
            const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
            if (positionState.heightQuality !== "mostDetailed") this.mostDetailedHeightQueuedKeys.add(key);
          });
        }
        this.mostDetailedHeightSamplingInProgress = false;
        this.scheduleDetailedHeights();
        this.logQueueStatus();
      });
  }

  private sampleGoogleRenderedHeights(positionStates: EntityPositionState[], cartographics: Cesium.Cartographic[], batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

    positionStates.forEach((positionState, index) => {
      const cartographic = cartographics[index];
      const height = sampleRenderedGoogleHeight(this.viewer.scene, cartographic);
      if (height === undefined) return;

      this.updatePositionState(positionState, getTerrainPosition(
        cartographic.longitude,
        cartographic.latitude,
        height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
      ), "rendered");
    });

    this.queueDetailedHeights(positionStates);
  }

  private useRenderedTerrainHeight(positionState: EntityPositionState, cartographic: Cesium.Cartographic, batchHeightSamplingGeneration: number): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

    const height = this.viewer.scene.globe.getHeight(cartographic) ?? 0;
    this.updatePositionState(positionState, getTerrainPosition(cartographic.longitude, cartographic.latitude, height), "rendered");
  }

  private async getWorldTerrainPosition(data: EntityCoordinates): Promise<Cesium.Cartesian3> {
    const cartographic = Cesium.Cartographic.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6);
    const height = this.viewer.scene.globe.getHeight(cartographic);
    if (height !== undefined) return getTerrainPosition(cartographic.longitude, cartographic.latitude, height);

    const terrainProvider = await this.worldTerrainProviderPromise;
    if (!terrainProvider) throw new Error("World terrain provider is unavailable");

    const [sampled] = await Cesium.sampleTerrain(terrainProvider, WORLD_TERRAIN_SAMPLE_LEVEL, [cartographic]);
    if (sampled.height === undefined) throw new Error("World terrain height is unavailable");

    return getTerrainPosition(sampled.longitude, sampled.latitude, sampled.height);
  }

  private refreshWorldTerrainPosition(positionState: EntityPositionState): void {
    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    this.getWorldTerrainPosition(positionState)
      .then((position) => {
        if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

        this.updatePositionState(positionState, position, "worldTerrain");
        this.queueHeightSample(positionState);
      })
      .catch(() => {
        logManager.warn(LOG_TAG, "World terrain height failed");
      });
  }

  private updatePositionState(positionState: EntityPositionState, position: Cesium.Cartesian3, heightQuality: HeightQuality): void {
    if (HEIGHT_QUALITY_RANK[heightQuality] < HEIGHT_QUALITY_RANK[positionState.heightQuality]) return;

    positionState.heightQuality = heightQuality;
    const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
    // Rendered heights are provisional; most-detailed heights are final until the terrain source changes.
    if (heightQuality === "mostDetailed") {
      this.refreshableHeightKeys.delete(key);
    } else {
      this.refreshableHeightKeys.add(key);
    }

    this.applyPositionState(positionState, position);
  }

  private applyPositionState(positionState: EntityPositionState, position: Cesium.Cartesian3): void {
    if (Cesium.Cartesian3.equals(positionState.position, position)) return;

    positionState.position = position;
    const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
    this.callbacksByKey.get(key)?.forEach(callback => callback(positionState.latE6, positionState.lngE6, position));
    this.viewer.scene.requestRender();
  }

  private logQueueStatus(): void {
    const renderedHeightCount = this.renderedHeightQueuedKeys.size + this.renderedHeightSamplingKeys.size;
    const detailedHeightCount = this.mostDetailedHeightQueuedKeys.size + this.mostDetailedHeightSamplingKeys.size;
    const hasQueuedOrSamplingTerrainHeights = this.hasQueuedOrSamplingTerrainHeights();
    const hasUnresolvedRefreshableTerrainPositions = this.hasUnresolvedRefreshableTerrainPositions();

    if (renderedHeightCount > 0 && detailedHeightCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${renderedHeightCount} portal positions`);
    } else if (renderedHeightCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${renderedHeightCount} portal positions`);
    } else if (detailedHeightCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${detailedHeightCount} detailed positions`);
    } else if (!hasQueuedOrSamplingTerrainHeights && !hasUnresolvedRefreshableTerrainPositions) {
      logManager.info(LOG_TAG, "Rendered all terrain positions");
    }

    if (!hasQueuedOrSamplingTerrainHeights) this.queueStatusLoggingActive = false;
  }

  private logQueueStartStatus(): void {
    if (this.queueStatusLoggingActive) return;

    this.queueStatusLoggingActive = true;
    this.logQueueStatus();
  }

  private hasQueuedOrSamplingTerrainHeights(): boolean {
    return this.renderedHeightQueuedKeys.size > 0 ||
      this.renderedHeightSamplingKeys.size > 0 ||
      this.mostDetailedHeightQueuedKeys.size > 0 ||
      this.mostDetailedHeightSamplingKeys.size > 0 ||
      this.mostDetailedHeightSamplingInProgress;
  }

  private hasUnresolvedRefreshableTerrainPositions(): boolean {
    for (const key of this.refreshableHeightKeys) {
      const positionState = this.positionStatesByKey.get(key);
      if (positionState && positionState.heightQuality !== "mostDetailed") return true;
    }

    return false;
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
  positionStates: Map<string, EntityPositionState>,
): EntityPositionState[] {
  const batch: EntityPositionState[] = [];

  for (const key of queuedHeightKeys) {
    queuedHeightKeys.delete(key);

    const positionState = positionStates.get(key);
    if (!positionState || positionState.heightQuality === "mostDetailed") continue;

    batch.push(positionState);
    if (batch.length >= GOOGLE_MOST_DETAILED_SAMPLE_BATCH_SIZE) break;
  }

  return batch;
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
