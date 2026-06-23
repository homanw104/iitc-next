/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";
import { settingsManager } from "./settingsManager";
import { SceneEventManager } from "./sceneEventManager";

const LOG_TAG = "EntityPositionManager";

// Raise portals slightly above Google 3D Tiles.
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Fast terrain-network sample used before an entity is first shown.
const WORLD_TERRAIN_SAMPLE_LEVEL = 11;

// Height sampling from currently rendered Google 3D Tiles.
const GOOGLE_RENDERED_SAMPLE_BATCH_SIZE = 16;
const GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS = 10;

type HeightSource = "worldTerrain" | "rendered";

const HEIGHT_SOURCE_RANK: Record<HeightSource, number> = {
  worldTerrain: 0,
  rendered: 1,
};

const heightSamplingCartographicScratch = new Cesium.Cartographic();

export type EntityPositionCallback = (latE6: number, lngE6: number, position: Cesium.Cartesian3) => void;

export interface EntityCoordinates {
  latE6: number;
  lngE6: number;
}

interface EntityPositionState extends EntityCoordinates {
  position: Cesium.Cartesian3;
  heightSource: HeightSource;
  renderedHeightSampleGeneration: number;
}

export class EntityPositionManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly positionStatesByKey = new Map<string, EntityPositionState>();
  private readonly pendingPositionPromisesByKey = new Map<string, Promise<Cesium.Cartesian3>>();
  private readonly worldTerrainProviderPromise: Promise<Cesium.TerrainProvider | undefined>;
  private readonly refreshableHeightKeys = new Set<string>();
  private readonly renderedHeightQueuedKeys = new Set<string>();
  private readonly renderedHeightSamplingKeys = new Set<string>();
  private readonly entityPositionCallbacks = new Map<string, Set<EntityPositionCallback>>();
  private renderedHeightSamplingScheduled = false;
  private renderedHeightSamplingTimeout: number | undefined;
  private cameraMoving = false;
  private heightSamplingViewRectangle: Cesium.Rectangle | undefined;
  private heightSamplingViewRectangleDirty = true;
  private heightSamplingGeneration = 0;
  private lastTerrainRefreshGeneration = -1;
  private queueStatusLoggingActive = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly sceneEventManager: SceneEventManager,
  ) {
    this.worldTerrainProviderPromise = Cesium.createWorldTerrainAsync()
      .catch(() => undefined);

    viewer.camera.moveStart.addEventListener(() => {
      this.cameraMoving = true;
      this.heightSamplingViewRectangleDirty = true;
      this.heightSamplingGeneration++;
      this.clearRenderedHeightWork();
    });

    viewer.camera.moveEnd.addEventListener(() => {
      this.cameraMoving = false;
      this.heightSamplingViewRectangleDirty = true;
      this.queueVisibleRefreshableRenderedHeights();
    });
  }

  public async getPosition(data: EntityCoordinates): Promise<Cesium.Cartesian3> {
    await this.sceneEventManager.waitForInitSceneLoaded();

    const entityPositionState = await this.getPositionState(data);
    this.queueRenderedHeight(entityPositionState);
    return entityPositionState.position;
  }

  private async getPositionState(data: EntityCoordinates): Promise<EntityPositionState> {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const entityPositionState = this.positionStatesByKey.get(key);
    if (entityPositionState) return entityPositionState;

    const position = await this.getInitialPosition(key, data);
    return this.positionStatesByKey.get(key) ?? this.createPositionState(data, position);
  }

  public setOnCoordinatePositionChangedCallback(data: EntityCoordinates, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.entityPositionCallbacks.get(key) ?? new Set<EntityPositionCallback>();
    callbacks.add(callback);
    this.entityPositionCallbacks.set(key, callbacks);
  }

  public unsetOnCoordinatePositionChangedCallback(data: EntityCoordinates, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.entityPositionCallbacks.get(key);
    if (!callbacks) return;

    callbacks.delete(callback);
    if (callbacks.size === 0) this.entityPositionCallbacks.delete(key);
  }

  public refreshTerrainPositions(): boolean {
    if (this.isHeightSamplingSuppressed()) return false;
    if (this.hasQueuedOrSamplingTerrainHeights()) return false;
    if (this.refreshableHeightKeys.size === 0) return true;
    if (this.lastTerrainRefreshGeneration === this.heightSamplingGeneration) return false;

    this.heightSamplingGeneration++;
    this.lastTerrainRefreshGeneration = this.heightSamplingGeneration;
    return this.queueVisibleRefreshableRenderedHeights();
  }

  public invalidateTerrainPositions(): boolean {
    const canRefreshWorldTerrainPositions = !this.isHeightSamplingSuppressed();

    this.heightSamplingGeneration++;
    this.refreshableHeightKeys.clear();
    this.clearRenderedHeightWork();

    this.positionStatesByKey.forEach((positionState) => {
      positionState.heightSource = "worldTerrain";
      positionState.renderedHeightSampleGeneration = -1;
      this.refreshableHeightKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6));
      if (canRefreshWorldTerrainPositions) this.refreshWorldTerrainPosition(positionState);
    });
    return true;
  }

  public hasRefreshableTerrainPositions(): boolean {
    return this.refreshableHeightKeys.size > 0;
  }

  private getInitialPosition(key: string, data: EntityCoordinates): Promise<Cesium.Cartesian3> {
    const pendingPosition = this.pendingPositionPromisesByKey.get(key);
    if (pendingPosition) return pendingPosition;

    const position = this.getWorldTerrainPosition(data)
      .finally(() => this.pendingPositionPromisesByKey.delete(key));
    this.pendingPositionPromisesByKey.set(key, position);
    return position;
  }

  private createPositionState(data: EntityCoordinates, position: Cesium.Cartesian3): EntityPositionState {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const positionState: EntityPositionState = {
      latE6: data.latE6,
      lngE6: data.lngE6,
      position,
      heightSource: "worldTerrain",
      renderedHeightSampleGeneration: -1,
    };
    this.positionStatesByKey.set(key, positionState);
    this.refreshableHeightKeys.add(key);
    return positionState;
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
        this.queueRenderedHeight(positionState);
      })
      .catch(() => {
        logManager.warn(LOG_TAG, "World terrain height failed");
      });
  }

  private queueVisibleRefreshableRenderedHeights(): boolean {
    const viewRectangle = this.getHeightSamplingViewRectangle();
    let queuedAny = false;

    this.refreshableHeightKeys.forEach((key) => {
      const positionState = this.positionStatesByKey.get(key);
      if (!positionState) {
        this.refreshableHeightKeys.delete(key);
        return;
      }

      if (this.queueRenderedHeight(positionState, viewRectangle)) queuedAny = true;
    });

    return queuedAny;
  }

  private queueRenderedHeight(
    positionState: EntityPositionState,
    viewRectangle = this.getHeightSamplingViewRectangle(),
  ): boolean {
    if (positionState.renderedHeightSampleGeneration === this.heightSamplingGeneration) return false;
    if (!this.isPositionInHeightSamplingView(positionState, viewRectangle)) return false;

    const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
    if (this.renderedHeightQueuedKeys.has(key) || this.renderedHeightSamplingKeys.has(key)) return false;

    this.renderedHeightQueuedKeys.add(key);
    this.scheduleRenderedHeights();
    return true;
  }

  private scheduleRenderedHeights(delayMs = 0): void {
    if (this.renderedHeightSamplingScheduled) return;
    if (this.isHeightSamplingSuppressed()) return;

    this.renderedHeightSamplingScheduled = true;
    this.renderedHeightSamplingTimeout = window.setTimeout(() => this.flushRenderedHeightQueue(), delayMs);
  }

  private scheduleRemainingRenderedHeights(): void {
    if (this.renderedHeightQueuedKeys.size === 0) return;

    this.scheduleRenderedHeights(
      this.useGoogle3dTiles ? GOOGLE_RENDERED_SAMPLE_BATCH_DELAY_MS : 0,
    );
  }

  private takeRenderedHeightBatch(): string[] {
    if (this.useGoogle3dTiles) {
      return takeHeightKeyBatch(this.renderedHeightQueuedKeys, GOOGLE_RENDERED_SAMPLE_BATCH_SIZE);
    }

    const keys = Array.from(this.renderedHeightQueuedKeys);
    this.renderedHeightQueuedKeys.clear();
    return keys;
  }

  private clearRenderedHeightWork(): void {
    if (this.renderedHeightSamplingTimeout !== undefined) window.clearTimeout(this.renderedHeightSamplingTimeout);
    this.renderedHeightSamplingTimeout = undefined;
    this.renderedHeightSamplingScheduled = false;
    this.renderedHeightQueuedKeys.clear();
    this.renderedHeightSamplingKeys.clear();
  }

  private flushRenderedHeightQueue(): void {
    this.renderedHeightSamplingScheduled = false;
    this.renderedHeightSamplingTimeout = undefined;
    if (this.isHeightSamplingSuppressed()) return;

    const keys = this.takeRenderedHeightBatch();
    if (keys.length === 0) return;

    const batchHeightSamplingGeneration = this.heightSamplingGeneration;
    const viewRectangle = this.getHeightSamplingViewRectangle();
    const positionStates = keys
      .map((key) => this.positionStatesByKey.get(key))
      .filter((positionState): positionState is EntityPositionState => {
        return !!positionState &&
          positionState.renderedHeightSampleGeneration !== batchHeightSamplingGeneration &&
          this.isPositionInHeightSamplingView(positionState, viewRectangle);
      });

    if (positionStates.length === 0) {
      this.scheduleRemainingRenderedHeights();
      return;
    }

    positionStates.forEach((positionState) => {
      positionState.renderedHeightSampleGeneration = batchHeightSamplingGeneration;
      this.renderedHeightSamplingKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6));
    });
    this.logQueueStatus(true);

    const cartographics = positionStates.map((positionState) => {
      return Cesium.Cartographic.fromDegrees(positionState.lngE6 / 1e6, positionState.latE6 / 1e6);
    });

    if (this.useGoogle3dTiles) {
      this.sampleGoogleRenderedHeights(positionStates, cartographics, batchHeightSamplingGeneration);
    } else {
      this.sampleTerrainRenderedHeights(positionStates, cartographics, batchHeightSamplingGeneration);
    }

    positionStates.forEach((positionState) => {
      this.renderedHeightSamplingKeys.delete(getEntityPositionKey(positionState.latE6, positionState.lngE6));
    });
    this.scheduleRemainingRenderedHeights();
    this.logQueueStatus();
  }

  private sampleGoogleRenderedHeights(
    positionStates: EntityPositionState[],
    cartographics: Cesium.Cartographic[],
    batchHeightSamplingGeneration: number,
  ): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

    positionStates.forEach((positionState, index) => {
      const cartographic = cartographics[index];
      const height = sampleRenderedGoogleHeight(this.viewer.scene, cartographic);
      if (height === undefined) return;

      this.updatePositionState(
        positionState,
        getTerrainPosition(
          cartographic.longitude,
          cartographic.latitude,
          height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
        ),
        "rendered",
      );
    });
  }

  private sampleTerrainRenderedHeights(
    positionStates: EntityPositionState[],
    cartographics: Cesium.Cartographic[],
    batchHeightSamplingGeneration: number,
  ): void {
    if (batchHeightSamplingGeneration !== this.heightSamplingGeneration || this.isHeightSamplingSuppressed()) return;

    positionStates.forEach((positionState, index) => {
      const cartographic = cartographics[index];
      const height = this.viewer.scene.globe.getHeight(cartographic) ?? 0;
      this.updatePositionState(
        positionState,
        getTerrainPosition(cartographic.longitude, cartographic.latitude, height),
        "rendered",
      );
    });
  }

  private updatePositionState(positionState: EntityPositionState, position: Cesium.Cartesian3, heightSource: HeightSource): void {
    if (HEIGHT_SOURCE_RANK[heightSource] < HEIGHT_SOURCE_RANK[positionState.heightSource]) return;

    positionState.heightSource = heightSource;
    this.refreshableHeightKeys.add(getEntityPositionKey(positionState.latE6, positionState.lngE6));
    this.applyPositionState(positionState, position);
  }

  private applyPositionState(positionState: EntityPositionState, position: Cesium.Cartesian3): void {
    if (Cesium.Cartesian3.equals(positionState.position, position)) return;

    positionState.position = position;
    const key = getEntityPositionKey(positionState.latE6, positionState.lngE6);
    this.entityPositionCallbacks.get(key)?.forEach(callback => callback(positionState.latE6, positionState.lngE6, position));
    this.viewer.scene.requestRender();
  }

  private isHeightSamplingSuppressed(): boolean {
    return this.cameraMoving;
  }

  private hasQueuedOrSamplingTerrainHeights(): boolean {
    return this.renderedHeightQueuedKeys.size > 0 || this.renderedHeightSamplingKeys.size > 0;
  }

  private getHeightSamplingViewRectangle(): Cesium.Rectangle | undefined {
    if (this.heightSamplingViewRectangleDirty) {
      this.heightSamplingViewRectangle = this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
      this.heightSamplingViewRectangleDirty = false;
    }

    return this.heightSamplingViewRectangle;
  }

  private isPositionInHeightSamplingView(
    positionState: EntityPositionState,
    viewRectangle: Cesium.Rectangle | undefined,
  ): boolean {
    if (!viewRectangle) return true;

    const cartographic = Cesium.Cartographic.fromDegrees(
      positionState.lngE6 / 1e6,
      positionState.latE6 / 1e6,
      0,
      heightSamplingCartographicScratch,
    );
    return Cesium.Rectangle.contains(viewRectangle, cartographic);
  }

  private logQueueStatus(isQueueStart = false): void {
    if (isQueueStart) {
      if (this.queueStatusLoggingActive) return;
      this.queueStatusLoggingActive = true;
    }

    const renderedHeightCount = this.renderedHeightQueuedKeys.size + this.renderedHeightSamplingKeys.size;

    if (renderedHeightCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${renderedHeightCount} entity positions`);
    } else {
      logManager.info(LOG_TAG, "Rendered all entity positions");
    }

    if (!this.hasQueuedOrSamplingTerrainHeights()) this.queueStatusLoggingActive = false;
  }
}

function getTerrainPosition(longitude: number, latitude: number, height: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromRadians(longitude, latitude, height);
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function takeHeightKeyBatch(
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

function sampleRenderedGoogleHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  if (scene.sampleHeightSupported) {
    try {
      return scene.sampleHeight(cartographic);
    } catch {
      logManager.debug(LOG_TAG, "Rendered heights failed to load");
    }
  }

  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return sceneWithGetHeight.getHeight(cartographic, Cesium.HeightReference.CLAMP_TO_3D_TILE);
}
