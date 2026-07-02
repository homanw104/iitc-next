/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "../system/logManager";
import type { SceneEventManager } from "../system/sceneEventManager";
import { settingsManager } from "../system/settingsManager";
import { Cartesian3 } from "cesium";

const LOG_TAG = "EntityPositionManager";

// Raise portals slightly above Google 3D Tiles
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Throttle the speed of sampling when using Google 3D Tiles
const GOOGLE_TILES_SAMPLE_BATCH_SIZE = 16;
const GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS = 10;

interface EntityData {
  latE6: number;
  lngE6: number;
}

export interface EntityPosition {
  latE6: number;
  lngE6: number;
  position: Cesium.Cartesian3;
  positionPromise: Promise<Cesium.Cartesian3>;
  positionPromiseResolver: (position: Cesium.Cartesian3) => void;
  positionCallbacks: Set<EntityPositionCallback>;
  isFallbackPosition: boolean;
}

export type EntityPositionCallback = (entityPosition: EntityPosition) => void;

export class EntityPositionManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly googleEntityPositions = new Map<string, EntityPosition>();
  private readonly googleEntityPositionsSamplingQueue = new Set<string>();
  private readonly googleEntityPositionsNowSampling = new Set<string>();
  private readonly googleSamplingIdleCallbacks = new Set<() => void>();
  private googleSamplingScheduled = false;
  private googleSamplingScheduledTimeoutId: number | undefined;

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

  public async getEntityPosition(data: EntityData): Promise<EntityPosition> {
    await this.sceneEventManager.waitForInitSceneLoaded();

    if (this.useGoogle3dTiles) {
      return this.registerGoogleEntityPosition(data);
    } else {
      return this.getTerrainEntityPosition(data);
    }
  }

  public setOnPositionChangedCallback(data: EntityData, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.googleEntityPositions.get(key)?.positionCallbacks;
    if (!callbacks) return;
    callbacks.add(callback);
  }

  public unsetOnPositionChangedCallback(data: EntityData, callback: EntityPositionCallback): void {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const callbacks = this.googleEntityPositions.get(key)?.positionCallbacks;
    if (!callbacks) return;
    callbacks.delete(callback);
  }

  public runAfterSamplingQueue(callback: () => void): void {
    if (this.isSamplingQueueEmpty()) {
      callback();
    } else {
      this.googleSamplingIdleCallbacks.add(callback);
    }
  }

  private registerGoogleEntityPosition(data: EntityData): EntityPosition {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const existing = this.googleEntityPositions.get(key);
    if (!existing) {
      let positionPromiseResolver: EntityPosition["positionPromiseResolver"] = () => undefined;
      const positionPromise = new Promise<Cesium.Cartesian3>((resolve) => {
        positionPromiseResolver = resolve;
      });
      const entityPosition: EntityPosition = {
        latE6: data.latE6,
        lngE6: data.lngE6,
        position: getFallbackPosition(data),
        positionPromise: positionPromise,
        positionPromiseResolver: positionPromiseResolver,
        positionCallbacks: new Set<EntityPositionCallback>(),
        isFallbackPosition: true,
      };
      this.googleEntityPositions.set(key, entityPosition);
      this.googleEntityPositionsSamplingQueue.add(key);
      this.scheduleSamplingWork();
      return entityPosition;
    } else {
      return existing;
    }
  }

  private getTerrainEntityPosition(data: EntityData): EntityPosition {
    const position = getTerrainPosition(this.viewer, data);
    return {
      latE6: data.latE6,
      lngE6: data.lngE6,
      position: position,
      positionPromise: Promise.resolve(position),
      positionPromiseResolver: () => {},
      positionCallbacks: new Set<EntityPositionCallback>(),
      isFallbackPosition: false,
    };
  }

  private scheduleSamplingWork(): void {
    if (this.googleSamplingScheduled) return;
    if (this.googleEntityPositionsSamplingQueue.size === 0) return;

    this.googleSamplingScheduled = true;
    this.googleSamplingScheduledTimeoutId = window.setTimeout(() => {
      this.googleSamplingScheduled = false;
      this.flushSamplingQueue();
    }, GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS);
  }

  private startSamplingWork(): void {
    if (!this.isSamplingQueueEmpty()) return;

    this.populateSamplingQueue();
    this.flushSamplingQueue();
  }

  private populateSamplingQueue(): void {
    this.googleEntityPositions.forEach((entityPosition, key) => {
      if (isEntityPositionInView(this.viewer, entityPosition)) this.googleEntityPositionsSamplingQueue.add(key);
    });
  }

  private flushSamplingQueue(): void {
    const keys = takeSamplingBatch(this.googleEntityPositionsSamplingQueue, GOOGLE_TILES_SAMPLE_BATCH_SIZE);
    keys.forEach((key) => {
      this.googleEntityPositionsSamplingQueue.delete(key);
      this.googleEntityPositionsNowSampling.add(key);

      const entityPosition = this.googleEntityPositions.get(key);

      if (!entityPosition) {
        this.googleEntityPositionsNowSampling.delete(key);
        return;
      }

      const height = getGooglePositionHeight(
        this.viewer.scene,
        Cesium.Cartographic.fromDegrees(
          entityPosition.lngE6 / 1e6,
          entityPosition.latE6 / 1e6,
        ),
      );

      let position: Cartesian3;
      let isFallbackPosition: boolean;
      if (height === undefined && !entityPosition.isFallbackPosition) {
        // Use last position if it's sampled before but failed to sample this time
        position = entityPosition.position;
        isFallbackPosition = false;
      } else {
        position = Cesium.Cartesian3.fromDegreesArrayHeights([
          entityPosition.lngE6 / 1e6,
          entityPosition.latE6 / 1e6,
          (height ?? 0) + GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
        ])[0];
        isFallbackPosition = height === undefined;
      }

      entityPosition.isFallbackPosition = isFallbackPosition;
      entityPosition.position = position;
      entityPosition.positionPromiseResolver(position);
      entityPosition.positionCallbacks.forEach((callback) => callback(entityPosition));

      this.googleEntityPositionsNowSampling.delete(key);
    });

    this.logQueueStatus();

    if (this.isSamplingQueueEmpty()) {
      this.clearSamplingWork();
    } else {
      this.flushRemainingSamplingQueue();
    }
  }

  private flushRemainingSamplingQueue(): void {
    if (this.googleSamplingScheduled) return;
    if (this.googleEntityPositionsSamplingQueue.size === 0) return;

    this.googleSamplingScheduled = true;
    this.googleSamplingScheduledTimeoutId = window.setTimeout(() => {
      this.googleSamplingScheduled = false;
      this.flushSamplingQueue();
    }, GOOGLE_TILES_SAMPLE_BATCH_DELAY_MS);
  }

  private clearSamplingWork(): void {
    this.googleEntityPositionsSamplingQueue.clear();
    this.googleEntityPositionsNowSampling.clear();
    window.clearTimeout(this.googleSamplingScheduledTimeoutId);
    this.googleSamplingScheduled = false;
    this.googleSamplingScheduledTimeoutId = undefined;
    this.googleSamplingIdleCallbacks.forEach((callback) => callback());
    this.googleSamplingIdleCallbacks.clear();
  }

  private logQueueStatus(): void {
    const samplingCount = this.googleEntityPositionsSamplingQueue.size + this.googleEntityPositionsNowSampling.size;

    if (samplingCount > 0) {
      logManager.info(LOG_TAG, `Rendering ${samplingCount} entity positions`);
    } else {
      logManager.info(LOG_TAG, "Rendered all entity positions");
    }
  }

  private isSamplingQueueEmpty(): boolean {
    return this.googleEntityPositionsNowSampling.size + this.googleEntityPositionsSamplingQueue.size === 0;
  }
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function getTerrainPosition(viewer: Cesium.Viewer, data: EntityData): Cesium.Cartesian3 {
  const height = viewer.scene.globe.getHeight(
    Cesium.Cartographic.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6)
  );
  return Cesium.Cartesian3.fromDegrees(
    data.lngE6 / 1e6,
    data.latE6 / 1e6,
    height,
  );
}

function getFallbackPosition(data: EntityData): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    data.lngE6 / 1e6,
    data.latE6 / 1e6,
    GOOGLE_GROUND_TERRAIN_COMPENSATION_METER,
  );
}

function getGooglePositionHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return sceneWithGetHeight.getHeight(cartographic, Cesium.HeightReference.CLAMP_TO_3D_TILE);
}

function isEntityPositionInView(viewer: Cesium.Viewer, entityPosition: EntityPosition): boolean {
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
