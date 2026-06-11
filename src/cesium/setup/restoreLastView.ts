/**
 * Restores the saved base layer and positions the camera from Intel map state.
 */

import * as Cesium from "cesium";
import { getMapPosition } from "../../utils/browser";
import { HEIGHT_AT_ZOOM_ZERO } from "../../utils/viewer";

// Storage key to save the base layer info
const BASE_LAYER_STORAGE_KEY = "iitc-next-base-layer";

export function restoreLastView(viewer: Cesium.Viewer): void {
  const modelName = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
  const viewModel = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find(m => m.name === modelName);
  if (viewModel) viewer.baseLayerPicker.viewModel.selectedImagery = viewModel;
  document.querySelectorAll(".cesium-baseLayerPicker-item").forEach((item) => {
    item.addEventListener("click", () => {
      localStorage.setItem(BASE_LAYER_STORAGE_KEY, viewer.baseLayerPicker.viewModel.selectedImagery.name);
    });
  });

  const pos = getMapPosition();
  if (pos) {
    const height = HEIGHT_AT_ZOOM_ZERO / Math.pow(2, pos.zoom);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(pos.lng, pos.lat, height),
    });
  }
}
