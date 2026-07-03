/**
 * Creates the complete base imagery layer list for Cesium's base layer picker.
 */

import * as Cesium from "cesium";
import { createCartoBaseLayerViewModels } from "../layer/cartoBaseLayers.ts";
import { createGaodeBaseLayerViewModels } from "../layer/gaodeBaseLayers.ts";
import { createGoogleBaseLayerViewModels } from "../layer/googleBaseLayers.ts";
import { createOpenStreetMapBaseLayerViewModels } from "../layer/openStreetMapBaseLayers.ts";
import { settingsManager } from "../../managers/system/settingsManager.ts";

export function createBaseLayerViewModels(): Cesium.ProviderViewModel[] | undefined {
  if (!settingsManager.getUseGoogle3dTiles()) {
    return [
      ...createCartoBaseLayerViewModels(),
      ...createGoogleBaseLayerViewModels(),
      ...createOpenStreetMapBaseLayerViewModels(),
      ...createGaodeBaseLayerViewModels(),
    ];
  }
}
