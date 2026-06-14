/**
 * Resolves shared terrain-aware positions for map entities.
 */

import * as Cesium from "cesium";
import { logManager } from "./logManager";

export interface EntityCoordinates {
  latE6: number;
  lngE6: number;
}

export type EntityPositionCallback = (latE6: number, lngE6: number, position: Cesium.Cartesian3) => void;

interface EntityPositionEntry extends EntityCoordinates {
  position: Cesium.Cartesian3;
  requestedVersion: number;
}

export class EntityPositionManager {
  private readonly entries = new Map<string, EntityPositionEntry>();
  private callbacks: EntityPositionCallback[] = [];
  private readonly queuedKeys = new Set<string>();
  private samplingScheduled = false;
  private version = 0;

  constructor(private readonly viewer: Cesium.Viewer) {}

  public getPosition(data: EntityCoordinates): Cesium.Cartesian3 {
    const key = getEntityPositionKey(data.latE6, data.lngE6);
    let entry = this.entries.get(key);

    if (!entry) {
      entry = {
        latE6: data.latE6,
        lngE6: data.lngE6,
        position: getEllipsoidPosition(data.latE6, data.lngE6),
        requestedVersion: -1,
      };
      this.entries.set(key, entry);
    }

    this.queueTerrainPosition(entry);
    return entry.position;
  }

  public setOnPositionChangedCallback(callback: EntityPositionCallback): void {
    this.callbacks.push(callback);
  }

  public unsetOnPositionChangedCallback(callback: EntityPositionCallback): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  public refreshTerrainPositions(): void {
    this.version++;
    this.entries.forEach((entry) => {
      entry.requestedVersion = -1;
      this.queueTerrainPosition(entry);
    });
  }

  private queueTerrainPosition(entry: EntityPositionEntry): void {
    if (entry.requestedVersion === this.version) return;

    entry.requestedVersion = this.version;
    this.queuedKeys.add(getEntityPositionKey(entry.latE6, entry.lngE6));

    if (this.samplingScheduled) return;
    this.samplingScheduled = true;
    setTimeout(() => this.flushTerrainQueue(), 0);
  }

  private flushTerrainQueue(): void {
    this.samplingScheduled = false;

    const keys = Array.from(this.queuedKeys);
    this.queuedKeys.clear();
    if (keys.length === 0) return;

    const requestVersion = this.version;
    const entries = keys
      .map((key) => this.entries.get(key))
      .filter((entry): entry is EntityPositionEntry => !!entry && entry.requestedVersion === requestVersion);
    if (entries.length === 0) return;

    const terrainProvider = this.viewer.terrainProvider;
    const cartographics = entries.map((entry) => Cesium.Cartographic.fromDegrees(entry.lngE6 / 1e6, entry.latE6 / 1e6));

    if (!terrainProvider.availability) {
      entries.forEach((entry, index) => this.updateFromRenderedTerrain(entry, cartographics[index], requestVersion));
      return;
    }

    Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics)
      .then((sampledPositions) => {
        if (requestVersion !== this.version) return;
        entries.forEach((entry, index) => {
          const sampled = sampledPositions[index];
          this.updateEntry(entry, getTerrainPosition(sampled.longitude, sampled.latitude, sampled.height));
        });
      })
      .catch((error) => {
        logManager.warn("EntityPositionManager", "Failed to sample terrain height", error);
        entries.forEach((entry, index) => this.updateFromRenderedTerrain(entry, cartographics[index], requestVersion));
      });
  }

  private updateFromRenderedTerrain(entry: EntityPositionEntry, cartographic: Cesium.Cartographic, requestVersion: number): void {
    if (requestVersion !== this.version) return;

    const height = this.viewer.scene.globe.getHeight(cartographic) ?? 0;
    this.updateEntry(entry, getTerrainPosition(cartographic.longitude, cartographic.latitude, height));
  }

  private updateEntry(entry: EntityPositionEntry, position: Cesium.Cartesian3): void {
    if (Cesium.Cartesian3.equals(entry.position, position)) return;

    entry.position = position;
    this.callbacks.forEach(callback => callback(entry.latE6, entry.lngE6, position));
    this.viewer.scene.requestRender();
  }
}

function getEntityPositionKey(latE6: number, lngE6: number): string {
  return `${latE6},${lngE6}`;
}

function getEllipsoidPosition(latE6: number, lngE6: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(lngE6 / 1e6, latE6 / 1e6);
}

function getTerrainPosition(longitude: number, latitude: number, height: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromRadians(longitude, latitude, height);
}
