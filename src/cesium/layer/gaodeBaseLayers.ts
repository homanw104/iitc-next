/**
 * Creates Gaode/AutoNavi imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import { GaodeTrafficImageryProvider } from "../imagery/gaodeTrafficImageryProvider.ts";
import { AmapMercatorTilingScheme } from "../../utils/map.ts";

type ProviderCreationFunction = Cesium.ProviderViewModel.CreationFunction;

const GAODE_SATELLITE_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingAerial.png");
const GAODE_ROAD_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingRoads.png");
const GAODE_HYBRID_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingAerialLabels.png");
const AUTONAVI_CREDIT = new Cesium.Credit("<a href=\"https://www.amap.com/\" target=\"_blank\" rel=\"noopener noreferrer\">&copy; 高德地图 AutoNavi</a>", true);

export function createGaodeBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    createGaodeViewModel("Gaode Satellite", "Gaode satellite imagery", GAODE_SATELLITE_ICON_URL, () => {
      return createGaodeProvider(6, false);
    }),
    createGaodeViewModel("Gaode Roads", "Gaode road map", GAODE_ROAD_ICON_URL, () => {
      return createGaodeProvider(7, false);
    }),
    createGaodeViewModel("Gaode Roads Traffic", "Gaode road map with traffic overlay", GAODE_ROAD_ICON_URL, () => {
      return [createGaodeProvider(7, false), createGaodeTrafficImageryProvider()];
    }),
    createGaodeViewModel("Gaode Hybrid", "Gaode satellite imagery with road overlay", GAODE_HYBRID_ICON_URL, () => {
      return [createGaodeProvider(6, false), createGaodeProvider(8, true)];
    }),
  ];
}

function createGaodeViewModel(
  name: string,
  tooltip: string,
  iconUrl: string,
  creationFunction: ProviderCreationFunction,
): Cesium.ProviderViewModel {
  return new Cesium.ProviderViewModel({
    name,
    iconUrl,
    tooltip,
    category: "AutoNavi",
    creationFunction,
  });
}

function createGaodeProvider(style: number, hasAlphaChannel: boolean): Cesium.UrlTemplateImageryProvider {
  return new Cesium.UrlTemplateImageryProvider({
    url: "https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style={style}&x={x}&y={y}&z={z}",
    subdomains: "1234",
    customTags: {
      style: () => String(style),
    },
    tilingScheme: new AmapMercatorTilingScheme({}),
    minimumLevel: 1,
    maximumLevel: 20,
    hasAlphaChannel,
    credit: AUTONAVI_CREDIT,
  });
}

function createGaodeTrafficImageryProvider(): Cesium.ImageryProvider {
  return new GaodeTrafficImageryProvider(AUTONAVI_CREDIT) as unknown as Cesium.ImageryProvider;
}
