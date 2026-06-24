/**
 * Manages camera-dependent translucency shared by entity visuals.
 */

import * as Cesium from "cesium";

const OCCLUDED_TRANSLUCENCY_NEAR_DISTANCE_MIN = 20;
const OCCLUDED_TRANSLUCENCY_FAR_DISTANCE_MIN = 80;
const OCCLUDED_TRANSLUCENCY_NEAR_HEIGHT_SCALE = 2;
const OCCLUDED_TRANSLUCENCY_FAR_HEIGHT_SCALE = 4;
const OCCLUDED_TRANSLUCENCY_NEAR_VALUE = 1;
const OCCLUDED_TRANSLUCENCY_FAR_VALUE = 0.025;

export class EntityTranslucencyManager {
  private readonly occludedTranslucencyByDistance: Cesium.CallbackProperty;

  constructor(private readonly viewer: Cesium.Viewer) {
    this.occludedTranslucencyByDistance = new Cesium.CallbackProperty(
      (_time, result) => getOccludedTranslucencyByCameraHeight(
        this.viewer.camera.positionCartographic.height,
        result,
      ),
      false,
    );
  }

  public getOccludedTranslucencyByDistance(): Cesium.CallbackProperty {
    return this.occludedTranslucencyByDistance;
  }
}

function getOccludedTranslucencyByCameraHeight(cameraHeight: number, result?: Cesium.NearFarScalar): Cesium.NearFarScalar {
  const height = Number.isFinite(cameraHeight) ? Math.max(0, cameraHeight) : 0;
  const translucencyByDistance = result ?? new Cesium.NearFarScalar();

  translucencyByDistance.near = Math.max(
    OCCLUDED_TRANSLUCENCY_NEAR_DISTANCE_MIN,
    height * OCCLUDED_TRANSLUCENCY_NEAR_HEIGHT_SCALE,
  );
  translucencyByDistance.nearValue = OCCLUDED_TRANSLUCENCY_NEAR_VALUE;
  translucencyByDistance.far = Math.max(
    OCCLUDED_TRANSLUCENCY_FAR_DISTANCE_MIN,
    height * OCCLUDED_TRANSLUCENCY_FAR_HEIGHT_SCALE,
  );
  translucencyByDistance.farValue = OCCLUDED_TRANSLUCENCY_FAR_VALUE;
  return translucencyByDistance;
}
