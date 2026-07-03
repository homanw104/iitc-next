/**
 * Creates Gaode/AutoNavi imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import { GaodeTrafficImageryProvider } from "../imagery/gaodeTrafficImageryProvider.ts";
import { AmapMercatorTilingScheme } from "../../utils/map.ts";
import gaodeHybridIconUrl from "../../images/imageryProviders/GaodeHybrid.png";
import gaodeRoadsIconUrl from "../../images/imageryProviders/GaodeRoads.png";
import gaodeRoadsTrafficIconUrl from "../../images/imageryProviders/GaodeRoadsTraffic.png";
import gaodeSatelliteIconUrl from "../../images/imageryProviders/GaodeSatellite.png";

type ProviderCreationFunction = Cesium.ProviderViewModel.CreationFunction;

const AUTONAVI_CREDIT = new Cesium.Credit("<a href=\"https://www.amap.com/\" target=\"_blank\" rel=\"noopener noreferrer\">&copy; 高德地图 AutoNavi</a>", true);

export function createGaodeBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    createGaodeViewModel("Gaode Satellite", "Gaode satellite imagery", gaodeSatelliteIconUrl, () => {
      return createGaodeProvider(6, false);
    }),
    createGaodeViewModel("Gaode Roads", "Gaode road map", gaodeRoadsIconUrl, () => {
      return createGaodeProvider(7, false);
    }),
    createGaodeViewModel("Gaode Roads Traffic", "Gaode road map with traffic overlay", gaodeRoadsTrafficIconUrl, () => {
      return [createGaodeProvider(7, false), createGaodeTrafficImageryProvider()];
    }),
    createGaodeViewModel("Gaode Hybrid", "Gaode satellite imagery with road overlay", gaodeHybridIconUrl, () => {
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
