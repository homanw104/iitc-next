/**
 * Restores the base layer selection from local storage and sets up event listeners to save changes.
 */

import Cesium from "cesium";
import { settingsManager } from "../../managers/system/settingsManager.ts";

const BASE_LAYER_STORAGE_KEY = "iitc-next-base-layer";

export function restoreBaseLayer(viewer: Cesium.Viewer): void {
  if (settingsManager.getUseGoogle3dTiles()) return;

  const modelName = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
  const viewModel = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find((viewModel) => viewModel.name === modelName);
  if (viewModel) {
    viewer.baseLayerPicker.viewModel.selectedImagery = viewModel;
  } else {
    localStorage.removeItem(BASE_LAYER_STORAGE_KEY);
  }

  document.querySelectorAll(".cesium-baseLayerPicker-item").forEach((item) => {
    item.addEventListener("click", () => {
      const selectedImagery = viewer.baseLayerPicker.viewModel.selectedImagery;
      if (selectedImagery) localStorage.setItem(BASE_LAYER_STORAGE_KEY, selectedImagery.name);
    });
  });
}
