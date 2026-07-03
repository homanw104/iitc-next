/**
 * Creates OpenStreetMap imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";

const OSM_ATTRIBUTION = "Map data &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";
const OPEN_STREET_MAP_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/openStreetMap.png");

export function createOpenStreetMapBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    new Cesium.ProviderViewModel({
      name: "OpenStreetMap",
      iconUrl: OPEN_STREET_MAP_ICON_URL,
      tooltip: "Native OpenStreetMap tiles",
      category: "OpenStreetMap",
      creationFunction: () => {
        return new Cesium.UrlTemplateImageryProvider({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          maximumLevel: 19,
          credit: OSM_ATTRIBUTION,
        });
      },
    }),
    new Cesium.ProviderViewModel({
      name: "CyclOSM",
      iconUrl: OPEN_STREET_MAP_ICON_URL,
      tooltip: "CyclOSM map style",
      category: "OpenStreetMap",
      creationFunction: () => {
        return new Cesium.UrlTemplateImageryProvider({
          url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
          maximumLevel: 19,
          credit: OSM_ATTRIBUTION,
        });
      },
    }),
  ];
}
