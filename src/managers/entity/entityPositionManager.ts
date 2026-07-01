/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "../system/logManager";
import type { SceneEventManager } from "../system/sceneEventManager";
import { settingsManager } from "../system/settingsManager";

const LOG_TAG = "EntityPositionManager";

// Raise portals slightly above Google 3D Tiles
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Throttle the speed of sampling when using Google 3D Tiles
const GOOGLE_TILES_SAMPLE_BATCH_SIZE = 16;
const GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS = 10;

export type EntityPositionCallback = (latE6: number, lngE6: number, position: Cesium.Cartesian3) => void;

interface EntityData {
  latE6: number;
  lngE6: number;
}

interface EntityPosition {
  latE6: number;
  lngE6: number;
  position: Cesium.Cartesian3 | undefined;
  positionPromise: Promise<Cesium.Cartesian3>;
  positionPromiseResolver: (position: Cesium.Cartesian3) => void;
  positionCallbacks: Set<EntityPositionCallback>;
}

export class EntityPositionManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly entityPositions = new Map<string, EntityPosition>();
  private readonly entityPositionsSamplingQueue = new Set<string>();
  private readonly entityPositionsNowSampling = new Set<string>();
  private readonly samplingIdleCallbacks = new Set<() => void>();
  private samplingScheduled = false;
  private samplingScheduledTimeoutId: number | undefined;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly sceneEventManager: SceneEventManager,
  ) {
    viewer.camera.moveStart.addEventListener(() => {
      if (this.useGoogle3dTiles) {
        this.clearSamplingWork();
      }
    });

    viewer.camera.moveEnd.addEventListener(() => {
      if (this.useGoogle3dTiles) {
        this.startSamplingWork();
      }
    });
  }

  public async getPosition(data: EntityData): Promise<Cesium.Cartesian3> {
    await this.sceneEventManager.waitForInitSceneLoaded();

    if (this.useGoogle3dTiles) {
      const entityPosition = this.registerEntityPosition(data);
      return entityPosition.positionPromise;
    } else {
      return getTerrainPosition(this.viewer, data);
    }
  }

  public setOnPositionChangedCallback(data: EntityData, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.entityPositions.get(key)?.positionCallbacks;
    if (!callbacks) return;
    callbacks.add(callback);
  }

  public unsetOnPositionChangedCallback(data: EntityData, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.entityPositions.get(key)?.positionCallbacks;
    if (!callbacks) return;
    callbacks.delete(callback);
  }

  public runAfterSamplingQueue(callback: () => void): void {
    if (this.isSamplingQueueEmpty()) {
      callback();
    } else {
      this.samplingIdleCallbacks.add(callback);
    }
  }

  private registerEntityPosition(data: EntityData): EntityPosition {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const existing = this.entityPositions.get(key);
    if (!existing) {
      let positionPromiseResolver: EntityPosition["positionPromiseResolver"] = () => undefined;
      const positionPromise = new Promise<Cesium.Cartesian3>((resolve) => {
        positionPromiseResolver = resolve;
      });
      const entityPosition = {
        latE6: data.latE6,
        lngE6: data.lngE6,
        position: undefined,
        positionPromise: positionPromise,
        positionPromiseResolver: positionPromiseResolver,
        positionCallbacks: new Set<EntityPositionCallback>(),
      };
      this.entityPositions.set(key, entityPosition);
      this.entityPositionsSamplingQueue.add(key);
      this.scheduleSamplingWork();
      return entityPosition;
    } else {
      return existing;
    }
  }

  private scheduleSamplingWork(): void {
    if (this.samplingScheduled) return;
    if (this.entityPositionsSamplingQueue.size === 0) return;

    this.samplingScheduled = true;
    this.samplingScheduledTimeoutId = window.setTimeout(() => {
      this.samplingScheduled = false;
      this.flushSamplingQueue();
    }, GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS);
  }

  private startSamplingWork(): void {
    if (!this.isSamplingQueueEmpty()) return;

    this.populateSamplingQueue();
    this.flushSamplingQueue();
  }

  private populateSamplingQueue(): void {
    this.entityPositions.forEach((entityPosition, key) => {
      if (entityPosition.position === undefined) this.entityPositionsSamplingQueue.add(key);
      else if (isEntityPositionInView(this.viewer, entityPosition)) this.entityPositionsSamplingQueue.add(key);
    });
  }

  private flushSamplingQueue(): void {
    const keys = takeSamplingBatch(this.entityPositionsSamplingQueue, GOOGLE_TILES_SAMPLE_BATCH_SIZE);
    keys.forEach((key) => {
      this.entityPositionsSamplingQueue.delete(key);
      this.entityPositionsNowSampling.add(key);

      const entityPosition = this.entityPositions.get(key);

      if (!entityPosition) {
        this.entityPositionsNowSampling.delete(key);
        return;
      }

      const height = getGoogleTilesPositionHeight(
        this.viewer.scene,
        Cesium.Cartographic.fromDegrees(
          entityPosition.lngE6 / 1e6,
          entityPosition.latE6 / 1e6,
        ),
      );

      if (height === undefined) {
        this.entityPositionsNowSampling.delete(key);
        return;
      }

      const position = Cesium.Cartesian3.fromDegreesArrayHeights([
        entityPosition.lngE6 / 1e6,
        entityPosition.latE6 / 1e6,
        height + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
      ])[0];

      entityPosition.position = position;
      entityPosition.positionPromiseResolver(position);
      entityPosition.positionCallbacks.forEach((callback) => {
        callback(entityPosition.latE6, entityPosition.lngE6, position);
      });

      this.entityPositionsNowSampling.delete(key);
    });

    this.logQueueStatus();

    if (this.isSamplingQueueEmpty()) {
      this.clearSamplingWork();
    } else {
      this.flushRemainingSamplingQueue();
    }
  }

  private flushRemainingSamplingQueue(): void {
    if (this.samplingScheduled) return;
    if (this.entityPositionsSamplingQueue.size === 0) return;

    this.samplingScheduled = true;
    this.samplingScheduledTimeoutId = window.setTimeout(() => {
      this.samplingScheduled = false;
      this.flushSamplingQueue();
    }, GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS);
  }

  private clearSamplingWork(): void {
    this.entityPositionsSamplingQueue.clear();
    this.entityPositionsNowSampling.clear();
    window.clearTimeout(this.samplingScheduledTimeoutId);
    this.samplingScheduled = false;
    this.samplingScheduledTimeoutId = undefined;
    this.samplingIdleCallbacks.forEach((callback) => callback());
    this.samplingIdleCallbacks.clear();
  }

  private logQueueStatus(): void {
    const samplingCount = this.entityPositionsSamplingQueue.size + this.entityPositionsNowSampling.size;

    if (samplingCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${samplingCount} entity positions`);
    } else {
      logManager.info(LOG_TAG, "Rendered all entity positions");
    }
  }

  private isSamplingQueueEmpty(): boolean {
    return this.entityPositionsNowSampling.size + this.entityPositionsSamplingQueue.size === 0;
  }
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function getTerrainPosition(viewer: Cesium.Viewer, data: EntityData): Cesium.Cartesian3 {
  const height = viewer.scene.globe.getHeight(
    Cesium.Cartographic.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6)
  );
  return Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6, height);
}

function getGoogleTilesPositionHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return sceneWithGetHeight.getHeight(cartographic, Cesium.HeightReference.CLAMP_TO_3D_TILE);
}

function isEntityPositionInView(viewer: Cesium.Viewer, entityPosition: EntityPosition): boolean {
  if (entityPosition.position === undefined) return true;

  const viewRectangle = viewer.camera.computeViewRectangle();
  if (!viewRectangle) return true;

  return Cesium.Rectangle.contains(viewRectangle, Cesium.Cartographic.fromCartesian(entityPosition.position));
}

function takeSamplingBatch(samplingQueue: Set<string>, limit: number,): string[] {
  const batch: string[] = [];

  for (const key of samplingQueue) {
    samplingQueue.delete(key);
    batch.push(key);
    if (batch.length >= limit) break;
  }

  return batch;
}
