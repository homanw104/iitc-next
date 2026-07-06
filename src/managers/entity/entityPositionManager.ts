/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "../system/logManager";
import type { LoadingProgressManager } from "../system/loadingProgressManager.ts";
import { settingsManager } from "../system/settingsManager";
import { Cartesian3 } from "cesium";

const LOG_TAG = "EntityPositionManager";

// Raise portals slightly above Google 3D Tiles
const GOOGLE_GROUND_TERRAIN_COMPENSATION_METER = 1;

// Horizon will be visible when camera pitch is above this threshold since the FOV is 60 degrees
const CAMERA_PITCH_THRESHOLD_DEGREES = -30;

interface EntityData {
  latE6: number;
  lngE6: number;
}

export interface EntityPosition {
  latE6: number;
  lngE6: number;
  position: Cesium.Cartesian3;
  positionCallbacks: Set<EntityPositionCallback>;
  isFallbackPosition: boolean;
}

export type EntityPositionCallback = (entityPosition: EntityPosition) => void;

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
    private readonly sceneEventManager: LoadingProgressManager,
  ) {
    viewer.camera.moveStart.addEventListener(() => {
      this.clearSamplingWork();
    });

    viewer.camera.moveEnd.addEventListener(() => {
      this.newSamplingWork();
    });
  }

  public async getEntityPosition(data: EntityData): Promise<EntityPosition> {
    await this.sceneEventManager.waitForInitSceneLoaded();
    return this.registerEntityPosition(data);
  }

  public invalidateEntityPositions(): void {
    this.entityPositions.forEach((entityPosition) => {
      entityPosition.isFallbackPosition = true;
    });
  }

  public clearSamplingWork(): void {
    window.clearTimeout(this.samplingScheduledTimeoutId);
    this.entityPositionsSamplingQueue.clear();
    this.entityPositionsNowSampling.clear();
    this.samplingScheduled = false;
    this.samplingScheduledTimeoutId = undefined;
    this.samplingIdleCallbacks.forEach((callback) => callback());
    this.samplingIdleCallbacks.clear();
  }

  public newSamplingWork(): void {
    if (!this.isSamplingQueueEmpty()) return;

    this.populateSamplingQueue();
    this.scheduleSamplingWork();
  }

  public runAfterSamplingWork(callback: () => void): void {
    if (this.isSamplingQueueEmpty()) {
      callback();
    } else {
      this.samplingIdleCallbacks.add(callback);
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

  private registerEntityPosition(data: EntityData): EntityPosition {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    const existing = this.entityPositions.get(key);
    if (!existing) {
      const entityPosition: EntityPosition = {
        latE6: data.latE6,
        lngE6: data.lngE6,
        position: getFallbackPosition(data),
        positionCallbacks: new Set<EntityPositionCallback>(),
        isFallbackPosition: true,
      };
      this.entityPositions.set(key, entityPosition);
      this.entityPositionsSamplingQueue.add(key);
      this.scheduleSamplingWork();
      return entityPosition;
    } else {
      return existing;
    }
  }

  private populateSamplingQueue(): void {
    this.entityPositions.forEach((entityPosition, key) => {
      if (isEntityPositionInView(this.viewer, entityPosition)) this.entityPositionsSamplingQueue.add(key);
    });
  }

  private scheduleSamplingWork(): void {
    if (this.samplingScheduled) return;
    if (this.entityPositionsSamplingQueue.size === 0) return;

    this.samplingScheduled = true;
    this.samplingScheduledTimeoutId = window.setTimeout(() => {
      this.samplingScheduled = false;
      this.flushSamplingQueue();
    }, getSamplingBatchDelayMs());
  }

  private flushSamplingQueue(): void {
    const keys = takeSamplingBatch(this.entityPositionsSamplingQueue, getSamplingBatchSize());
    keys.forEach((key) => {
      this.entityPositionsSamplingQueue.delete(key);
      this.entityPositionsNowSampling.add(key);

      const entityPosition = this.entityPositions.get(key);

      if (!entityPosition) {
        this.entityPositionsNowSampling.delete(key);
        return;
      }

      let height: number | undefined;
      if (this.useGoogle3dTiles) {
        height = getGoogleHeight(
          this.viewer.scene,
          Cesium.Cartographic.fromDegrees(
            entityPosition.lngE6 / 1e6,
            entityPosition.latE6 / 1e6,
          ),
        );
        if (height) height += GOOGLE_GROUND_TERRAIN_COMPENSATION_METER;
      } else {
        height = this.viewer.scene.globe.getHeight(
          Cesium.Cartographic.fromDegrees(
            entityPosition.lngE6 / 1e6,
            entityPosition.latE6 / 1e6
          ),
        );
      }

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
          height ?? 0,
        ])[0];
        isFallbackPosition = height === undefined;
      }

      entityPosition.isFallbackPosition = isFallbackPosition;
      entityPosition.position = position;
      entityPosition.positionCallbacks.forEach((callback) => callback(entityPosition));

      this.entityPositionsNowSampling.delete(key);
    });

    this.logQueueStatus();

    if (this.isSamplingQueueEmpty()) {
      window.clearTimeout(this.samplingScheduledTimeoutId);
      this.samplingScheduled = false;
      this.samplingScheduledTimeoutId = undefined;
      this.samplingIdleCallbacks.forEach((callback) => callback());
      this.samplingIdleCallbacks.clear();
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
    }, getSamplingBatchDelayMs());
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

function getSamplingBatchSize(): number {
  return settingsManager.getUseGoogle3dTiles() ? 16 : 128;
}

function getSamplingBatchDelayMs(): number {
  return settingsManager.getUseGoogle3dTiles() ? 10 : 2;
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function getFallbackPosition(data: EntityData): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(
    data.lngE6 / 1e6,
    data.latE6 / 1e6,
    0,
  );
}

function getGoogleHeight(scene: Cesium.Scene, cartographic: Cesium.Cartographic): number | undefined {
  const sceneWithGetHeight = scene as Cesium.Scene & {
    getHeight: (cartographic: Cesium.Cartographic, heightReference?: Cesium.HeightReference) => number | undefined;
  };
  return sceneWithGetHeight.getHeight(cartographic, Cesium.HeightReference.CLAMP_TO_3D_TILE);
}

function isEntityPositionInView(viewer: Cesium.Viewer, entityPosition: EntityPosition): boolean {
  // Count all entities as in view if the horizon is visible
  const cameraPith = Cesium.Math.toDegrees(viewer.camera.pitch);
  if (cameraPith > CAMERA_PITCH_THRESHOLD_DEGREES) return true;

  // Count all entities as in view if the view rectangle is not defined
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
