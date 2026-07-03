/**
 * Creates the complete base imagery layer list for Cesium's base layer picker.
 */

import * as Cesium from "cesium";
import { createCartoBaseLayerViewModels } from "./cartoBaseLayers.ts";
import { createGaodeBaseLayerViewModels } from "./gaodeBaseLayers.ts";
import { createGoogleBaseLayerViewModels } from "./googleBaseLayers.ts";
import { createOpenStreetMapBaseLayerViewModels } from "./openStreetMapBaseLayers.ts";

export function createBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    ...createCartoBaseLayerViewModels(),
    ...createGoogleBaseLayerViewModels(),
    ...createOpenStreetMapBaseLayerViewModels(),
    ...createGaodeBaseLayerViewModels(),
  ];
}
