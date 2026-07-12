/**
 * Manages the user location marker, accuracy range, and geolocation updates.
 */

import * as Cesium from "cesium";
import type { FilterChangedCallback, LayerManager } from "../layer/layerManager";
import { logManager } from "../system/logManager";

const LOG_TAG = "UserLocationManager";
const USER_LOCATION_LAYER_ID = "user-location";
const USER_LOCATION_RANGE_LAYER_ID = "user-location-range";
const USER_LOCATION_RANGE_Z_INDEX = 20;
const USER_LOCATION_ENTITY_ID = "user-location-marker";
const ACCURACY_AREA_KEY = "accuracy-area";
const ACCURACY_RING_KEY = "accuracy-ring";
const LOCATION_MARKER_PIXEL_SIZE = 14;
const LOCATION_MARKER_OUTLINE_WIDTH = 4;
const ACCURACY_RING_WIDTH = 2;
const ACCURACY_RING_SEGMENTS = 96;
const LOCATION_REFRESH_INTERVAL_MS = 5000;
const GEOLOCATION_PERMISSION_DENIED = 1;
const LOCATION_COLOR = Cesium.Color.fromCssColorString("#7abcff");

export class UserLocationManager {
  private readonly marker: Cesium.Entity;
  private refreshInterval: number | undefined;
  private trackingGeneration = 0;
  private periodicRequestInFlight = false;

  constructor(
    private readonly layerManager: LayerManager,
  ) {
    const markerLayer = this.layerManager.getOrCreateDataSource(USER_LOCATION_LAYER_ID);
    this.marker = markerLayer.entities.add({
      id: USER_LOCATION_ENTITY_ID,
      point: {
        color: LOCATION_COLOR,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: LOCATION_MARKER_OUTLINE_WIDTH,
        pixelSize: LOCATION_MARKER_PIXEL_SIZE,
      },
    });
    this.layerManager.getOrCreateGroundPrimitiveLayer(
      USER_LOCATION_RANGE_LAYER_ID,
      USER_LOCATION_RANGE_Z_INDEX,
    );
    this.layerManager.addFilterChangedCallback(this.filterChangedCallback);
    this.syncTrackingWithLayerVisibility();
  }

  public async getLocation(): Promise<GeolocationPosition> {
    const position = await this.requestCurrentPosition();
    this.updateLocation(position.coords);
    return position;
  }

  public updateLocation(coords: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy">): void {
    const { latitude, longitude, accuracy } = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const center = Cesium.Cartesian3.fromDegrees(longitude, latitude);
    this.marker.position = new Cesium.ConstantPositionProperty(center);

    const rangeLayer = this.layerManager.getOrCreateGroundPrimitiveLayer(
      USER_LOCATION_RANGE_LAYER_ID,
      USER_LOCATION_RANGE_Z_INDEX,
    );
    if (!Number.isFinite(accuracy) || accuracy <= 0) {
      rangeLayer.removeManagedPrimitive(ACCURACY_AREA_KEY);
      rangeLayer.removeManagedPrimitive(ACCURACY_RING_KEY);
      return;
    }

    rangeLayer.replacePrimitiveWhenReady(ACCURACY_AREA_KEY, createAccuracyArea(center, accuracy));
    rangeLayer.replacePrimitiveWhenReady(ACCURACY_RING_KEY, createAccuracyRing(center, accuracy));
  }

  private filterChangedCallback: FilterChangedCallback = (name) => {
    if (name !== USER_LOCATION_LAYER_ID && name !== USER_LOCATION_RANGE_LAYER_ID) return;
    this.syncTrackingWithLayerVisibility();
  };

  private syncTrackingWithLayerVisibility(): void {
    if (this.isAnyLocationLayerEnabled()) {
      this.startTracking().then();
    } else {
      this.stopTracking();
    }
  }

  private async startTracking(): Promise<void> {
    if (this.refreshInterval !== undefined) return;

    const generation = ++this.trackingGeneration;
    const permission = await getGeolocationPermission();
    if (generation !== this.trackingGeneration || !this.isAnyLocationLayerEnabled()) return;
    if (permission === "denied") {
      logManager.warn(LOG_TAG, "Geolocation permission is denied");
      return;
    }

    this.refreshTrackedLocation();
    this.refreshInterval = window.setInterval(() => {
      this.refreshTrackedLocation();
    }, LOCATION_REFRESH_INTERVAL_MS);
  }

  private stopTracking(): void {
    this.trackingGeneration += 1;
    if (this.refreshInterval !== undefined) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private refreshTrackedLocation(): void {
    if (this.periodicRequestInFlight) return;
    this.periodicRequestInFlight = true;
    this.requestCurrentPosition()
      .then(position => this.updateLocation(position.coords))
      .catch((error: GeolocationPositionError | Error) => {
        if (isPermissionDeniedError(error)) this.stopTracking();
        logManager.warn(LOG_TAG, "Failed to refresh location", error);
      })
      .finally(() => {
        this.periodicRequestInFlight = false;
      });
  }

  private requestCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: LOCATION_REFRESH_INTERVAL_MS,
      });
    });
  }

  private isAnyLocationLayerEnabled(): boolean {
    return this.layerManager.isFilterEnabled(USER_LOCATION_LAYER_ID)
      || this.layerManager.isFilterEnabled(USER_LOCATION_RANGE_LAYER_ID);
  }
}

async function getGeolocationPermission(): Promise<PermissionState | undefined> {
  if (!navigator.permissions) return undefined;

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch (error) {
    logManager.debug(LOG_TAG, "Unable to query geolocation permission", error);
    return undefined;
  }
}

function isPermissionDeniedError(error: GeolocationPositionError | Error): error is GeolocationPositionError {
  return "code" in error && error.code === GEOLOCATION_PERMISSION_DENIED;
}

function createAccuracyArea(center: Cesium.Cartesian3, radius: number): Cesium.GroundPrimitive {
  return new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CircleGeometry({
        center,
        radius,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(LOCATION_COLOR.withAlpha(0.5)),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }),
    allowPicking: false,
    asynchronous: true,
    classificationType: Cesium.ClassificationType.BOTH,
  });
}

function createAccuracyRing(center: Cesium.Cartesian3, radius: number): Cesium.GroundPolylinePrimitive {
  return new Cesium.GroundPolylinePrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.GroundPolylineGeometry({
        positions: createCirclePositions(center, radius),
        width: ACCURACY_RING_WIDTH,
        arcType: Cesium.ArcType.GEODESIC,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(LOCATION_COLOR.withAlpha(0.9)),
      },
    }),
    appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
    allowPicking: false,
    asynchronous: true,
    classificationType: Cesium.ClassificationType.BOTH,
  });
}

function createCirclePositions(center: Cesium.Cartesian3, radius: number): Cesium.Cartesian3[] {
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const positions = Array.from({ length: ACCURACY_RING_SEGMENTS }, (_, index) => {
    const angle = Cesium.Math.TWO_PI * index / ACCURACY_RING_SEGMENTS;
    const localPosition = new Cesium.Cartesian3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0,
    );
    const worldPosition = Cesium.Matrix4.multiplyByPoint(transform, localPosition, new Cesium.Cartesian3());
    return Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(worldPosition) ?? worldPosition;
  });

  positions.push(Cesium.Cartesian3.clone(positions[0]));
  return positions;
}
