/**
 * Creates OpenStreetMap imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import cyclOSMIconUrl from "../../images/imageryProviders/CyclOSM.png";
import openStreetMapIconUrl from "../../images/imageryProviders/OpenStreetMap.png";

const OSM_ATTRIBUTION = "Map data &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors";

export function createOpenStreetMapBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    new Cesium.ProviderViewModel({
      name: "OpenStreetMap",
      iconUrl: openStreetMapIconUrl,
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
      iconUrl: cyclOSMIconUrl,
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
