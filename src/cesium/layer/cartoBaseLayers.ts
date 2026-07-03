/**
 * Creates Carto imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";

const CARTO_ATTRIBUTION =
  "Map data &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, " +
  "&copy; <a href=\"https://carto.com/attributions\">CARTO</a>";
const CARTO_DARK_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/stadiaAlidadeSmoothDark.png");
const CARTO_LIGHT_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/stadiaAlidadeSmooth.png");

export function createCartoBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    new Cesium.ProviderViewModel({
      name: "CartoDB Dark Matter",
      iconUrl: CARTO_DARK_ICON_URL,
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
      iconUrl: CARTO_LIGHT_ICON_URL,
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
