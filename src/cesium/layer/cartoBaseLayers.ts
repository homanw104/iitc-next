/**
 * Creates Carto imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import cartoDBDarkMatterIconUrl from "../../images/imageryProviders/CartoDBDarkMatter.png";
import cartoDBPositronIconUrl from "../../images/imageryProviders/CartoDBPositron.png";

const CARTO_ATTRIBUTION =
  "Map data &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, " +
  "&copy; <a href=\"https://carto.com/attributions\">CARTO</a>";

export function createCartoBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    new Cesium.ProviderViewModel({
      name: "CartoDB Dark Matter",
      iconUrl: cartoDBDarkMatterIconUrl,
      tooltip: "Dark CARTO basemap",
      category: "Carto",
      creationFunction: () => {
        return new Cesium.UrlTemplateImageryProvider({
          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          subdomains: "abcd",
          maximumLevel: 20,
          credit: CARTO_ATTRIBUTION,
        });
      },
    }),
    new Cesium.ProviderViewModel({
      name: "CartoDB Positron",
      iconUrl: cartoDBPositronIconUrl,
      tooltip: "Light CARTO basemap",
      category: "Carto",
      creationFunction: () => {
        return new Cesium.UrlTemplateImageryProvider({
          url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          subdomains: "abcd",
          maximumLevel: 20,
          credit: CARTO_ATTRIBUTION,
        });
      },
    }),
  ];
}
