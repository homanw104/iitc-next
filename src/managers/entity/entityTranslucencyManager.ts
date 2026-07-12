/**
 * Manages camera-dependent translucency shared by entity visuals.
 */

import * as Cesium from "cesium";
import { settingsManager } from "../system/settingsManager";

const OCCLUDED_TRANSLUCENCY_NEAR_DISTANCE_MIN = 20;
const OCCLUDED_TRANSLUCENCY_FAR_DISTANCE_MIN = 300;
const OCCLUDED_TRANSLUCENCY_NEAR_HEIGHT_SCALE = 2;
const OCCLUDED_TRANSLUCENCY_FAR_HEIGHT_SCALE = 3;
const OCCLUDED_TRANSLUCENCY_NEAR_VALUE = 1;
const OCCLUDED_TRANSLUCENCY_FAR_VALUE = 0.025;
const CAMERA_TERRAIN_SAMPLE_LEVEL = 11;
const CAMERA_TERRAIN_RESAMPLE_EPSILON_RADIANS = 1e-5;
const CAMERA_TERRAIN_SAMPLE_RETRY_DELAY_MS = 500;

export type TranslucencyByDistanceCallback = (translucencyByDistance: Cesium.NearFarScalar) => void;

export class EntityTranslucencyManager {
  private readonly useGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  private readonly translucencyByDistance = new Cesium.ConstantProperty(new Cesium.NearFarScalar());
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly scratchTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallbacks = new Set<TranslucencyByDistanceCallback>();
  private worldTerrainProviderPromise: Promise<Cesium.TerrainProvider | undefined> | undefined;
  private cameraTerrainSampleInFlight = false;
  private nextCameraTerrainSampleTimeMs = 0;
  private sampledTerrainPosition: Cesium.Cartographic | undefined;
  private sampledTerrainHeight: number | undefined;
  private terrainSampleGeneration = 0;

  constructor(
    private readonly viewer: Cesium.Viewer,
  ) {
    generateTranslucencyByDistance(0, this.currentTranslucencyByDistance);
    this.translucencyByDistance.setValue(this.currentTranslucencyByDistance);

    viewer.camera.moveStart.addEventListener(this.handleCameraMoveStart);
    viewer.camera.moveEnd.addEventListener(this.handleCameraMoveEnd);

    this.newSamplingWork();
  }

  public getTranslucencyByDistance(): Cesium.ConstantProperty {
    return this.translucencyByDistance;
  }

  public addTranslucencyByDistanceChangedCallback(callback: TranslucencyByDistanceCallback): void {
    this.translucencyByDistanceCallbacks.add(callback);
    callback(this.currentTranslucencyByDistance);
  }

  public removeTranslucencyByDistanceChangedCallback(callback: TranslucencyByDistanceCallback): void {
    this.translucencyByDistanceCallbacks.delete(callback);
  }

  public clearSamplingWork(): void {
    this.terrainSampleGeneration++;
    this.cameraTerrainSampleInFlight = false;
  }

  public newSamplingWork(): void {
    this.updateTranslucencyByDistance();
  }

  public invalidateTerrainSample(): void {
    this.sampledTerrainPosition = undefined;
    this.sampledTerrainHeight = undefined;
  }

  private readonly handleCameraMoveStart = (): void => this.clearSamplingWork();
  private readonly handleCameraMoveEnd = (): void => this.newSamplingWork();

  private updateTranslucencyByDistance(): void {
    const cameraHeight = this.getCameraHeightAboveTerrain();
    const clampedCameraHeight = Number.isFinite(cameraHeight) ? cameraHeight : 0;
    generateTranslucencyByDistance(clampedCameraHeight, this.scratchTranslucencyByDistance);

    if (Cesium.NearFarScalar.equals(this.currentTranslucencyByDistance, this.scratchTranslucencyByDistance)) return;

    Cesium.NearFarScalar.clone(this.scratchTranslucencyByDistance, this.currentTranslucencyByDistance);

    // setValue() will trigger entity consumers to update
    this.translucencyByDistance.setValue(this.currentTranslucencyByDistance);
    this.translucencyByDistanceCallbacks.forEach((callback) => callback(this.currentTranslucencyByDistance));
    this.viewer.scene.requestRender();
  }

  private getCameraHeightAboveTerrain(): number {
    const cartographic = this.viewer.camera.positionCartographic;
    this.requestTerrainHeightSample(cartographic);

    const surfaceHeight = this.sampledTerrainHeight
      ?? this.viewer.scene.globe.getHeight(cartographic);
    return surfaceHeight === undefined
      ? cartographic.height
      : cartographic.height - surfaceHeight;
  }

  private requestTerrainHeightSample(cartographic: Cesium.Cartographic): void {
    if (!this.shouldSampleTerrainHeight(cartographic)) return;

    const generation = this.terrainSampleGeneration;
    this.cameraTerrainSampleInFlight = true;
    this.nextCameraTerrainSampleTimeMs = Date.now() + CAMERA_TERRAIN_SAMPLE_RETRY_DELAY_MS;
    const samplePosition = new Cesium.Cartographic(cartographic.longitude, cartographic.latitude);

    this.getSamplingTerrainProvider()
      .then((terrainProvider) => terrainProvider
        ? Cesium.sampleTerrain(terrainProvider, CAMERA_TERRAIN_SAMPLE_LEVEL, [samplePosition])
        : Promise.resolve(undefined))
      .then((sampledPositions) => {
        if (generation !== this.terrainSampleGeneration) return;

        const sampledHeight = sampledPositions?.[0]?.height;
        if (sampledHeight === undefined || !Number.isFinite(sampledHeight)) return;

        this.sampledTerrainPosition = samplePosition;
        this.sampledTerrainHeight = sampledHeight;
        this.updateTranslucencyByDistance();
      })
      .catch(() => {
        if (generation !== this.terrainSampleGeneration) return;
        this.nextCameraTerrainSampleTimeMs = Date.now() + CAMERA_TERRAIN_SAMPLE_RETRY_DELAY_MS;
      })
      .finally(() => {
        if (generation !== this.terrainSampleGeneration) return;
        this.cameraTerrainSampleInFlight = false;
      });
  }

  private shouldSampleTerrainHeight(cartographic: Cesium.Cartographic): boolean {
    if (this.cameraTerrainSampleInFlight) return false;
    if (Date.now() < this.nextCameraTerrainSampleTimeMs) return false;
    if (!this.useGoogle3dTiles && this.viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider) return false;
    if (this.sampledTerrainPosition === undefined) return true;

    return hasMovedPastTerrainSampleEpsilon(cartographic, this.sampledTerrainPosition);
  }

  private getSamplingTerrainProvider(): Promise<Cesium.TerrainProvider | undefined> {
    if (this.useGoogle3dTiles) {
      this.worldTerrainProviderPromise ??= Cesium.createWorldTerrainAsync().catch(() => undefined);
      return this.worldTerrainProviderPromise;
    } else {
      return Promise.resolve(this.viewer.terrainProvider);
    }
  }
}

function hasMovedPastTerrainSampleEpsilon(
  currentPosition: Cesium.Cartographic,
  sampledPosition: Cesium.Cartographic,
): boolean {
  const longitudeDelta = Math.abs(Cesium.Math.negativePiToPi(currentPosition.longitude - sampledPosition.longitude));
  const latitudeDelta = Math.abs(currentPosition.latitude - sampledPosition.latitude);

  return longitudeDelta > CAMERA_TERRAIN_RESAMPLE_EPSILON_RADIANS ||
    latitudeDelta > CAMERA_TERRAIN_RESAMPLE_EPSILON_RADIANS;
}

function generateTranslucencyByDistance(cameraHeight: number, result?: Cesium.NearFarScalar): Cesium.NearFarScalar {
  const nearFarScalar = result ?? new Cesium.NearFarScalar();

  nearFarScalar.near = Math.max(
    OCCLUDED_TRANSLUCENCY_NEAR_DISTANCE_MIN,
    cameraHeight * OCCLUDED_TRANSLUCENCY_NEAR_HEIGHT_SCALE,
  );
  nearFarScalar.nearValue = OCCLUDED_TRANSLUCENCY_NEAR_VALUE;
  nearFarScalar.far = Math.max(
    OCCLUDED_TRANSLUCENCY_FAR_DISTANCE_MIN,
    cameraHeight * OCCLUDED_TRANSLUCENCY_FAR_HEIGHT_SCALE,
  );
  nearFarScalar.farValue = OCCLUDED_TRANSLUCENCY_FAR_VALUE;
  return nearFarScalar;
}
