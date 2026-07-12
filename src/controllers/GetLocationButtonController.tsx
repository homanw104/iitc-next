import { Cartesian3 } from "cesium";
import type * as Cesium from "cesium";
import type { UserLocationManager } from "../managers/entity/userLocationManager.ts";
import { logManager } from "../managers/system/logManager.ts";

const LOG_TAG = "GetLocationButtonController";
const PRECISE_LOCATION_CAMERA_HEIGHT = 1000;
const APPROXIMATE_LOCATION_ACCURACY_THRESHOLD = 1000;
const APPROXIMATE_LOCATION_CAMERA_HEIGHT_MULTIPLIER = 4;
const MAX_APPROXIMATE_LOCATION_CAMERA_HEIGHT = 40000;

export class GetLocationButtonController {
  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly userLocationManager: UserLocationManager,
  ) {}

  public flyToCurrentLocation(): void {
    this.userLocationManager.getLocation()
      .then(({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        if (accuracy >= APPROXIMATE_LOCATION_ACCURACY_THRESHOLD) {
          logManager.info(LOG_TAG, "Using approximate location");
        }
        this.viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(longitude, latitude, getCameraHeightForAccuracy(accuracy)),
          duration: 2.4,
        });
      })
      .catch((error: GeolocationPositionError | Error) => {
        logManager.error(LOG_TAG, "Failed to get location", error);
      });
  }
}

function getCameraHeightForAccuracy(accuracy: number): number {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return PRECISE_LOCATION_CAMERA_HEIGHT;

  return Math.min(
    Math.max(PRECISE_LOCATION_CAMERA_HEIGHT, accuracy * APPROXIMATE_LOCATION_CAMERA_HEIGHT_MULTIPLIER),
    MAX_APPROXIMATE_LOCATION_CAMERA_HEIGHT,
  );
}
