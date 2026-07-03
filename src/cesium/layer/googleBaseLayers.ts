/**
 * Creates Google imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import {
  GoogleMapsJsTileImageryProvider,
  type GoogleMapsJsStyle,
  type GoogleMapsJsTileImageryProviderOptions,
} from "../imagery/googleMapsJsTileImageryProvider.ts";
import googleHybridIconUrl from "../../images/imageryProviders/GoogleHybrid.png";
import googleIngressMapIconUrl from "../../images/imageryProviders/GoogleIngressMap.png";
import googleRoadsIconUrl from "../../images/imageryProviders/GoogleRoads.png";
import googleRoadsTrafficIconUrl from "../../images/imageryProviders/GoogleRoadsTraffic.png";
import googleRoadsTransitIconUrl from "../../images/imageryProviders/GoogleRoadsTransit.png";
import googleSatelliteIconUrl from "../../images/imageryProviders/GoogleSatellite.png";
import googleTerrainIconUrl from "../../images/imageryProviders/GoogleTerrain.png";

type ProviderCreationFunction = Cesium.ProviderViewModel.CreationFunction;

const GOOGLE_MAPS_CREDIT = new Cesium.Credit("<span translate=\"no\">Google Maps</span>", true);

const GOOGLE_INGRESS_MAP_STYLES: GoogleMapsJsStyle[] = [
  {
    featureType: "all",
    elementType: "all",
    stylers: [
      { visibility: "on" },
      { hue: "#131c1c" },
      { saturation: -50 },
      { invert_lightness: true },
    ],
  },
  {
    featureType: "water",
    elementType: "all",
    stylers: [
      { visibility: "on" },
      { hue: "#005eff" },
      { invert_lightness: true },
    ],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ invert_lightness: true }],
  },
];

export function createGoogleBaseLayerViewModels(): Cesium.ProviderViewModel[] {
  return [
    createGoogleViewModel("Google Ingress Map", "Google roadmap styled like the stock Ingress Intel map", googleIngressMapIconUrl, () => {
      return createGoogleProvider({ mapType: "roadmap", styles: GOOGLE_INGRESS_MAP_STYLES });
    }),
    createGoogleViewModel("Google Roads", "Google roadmap", googleRoadsIconUrl, () => {
      return createGoogleProvider({ mapType: "roadmap" });
    }),
    createGoogleViewModel("Google Roads Traffic", "Google roadmap with traffic overlay", googleRoadsTrafficIconUrl, () => {
      return createGoogleProvider({ mapType: "roadmap", overlayLayer: "TrafficLayer" });
    }),
    createGoogleViewModel("Google Roads Transit", "Google roadmap with transit overlay", googleRoadsTransitIconUrl, () => {
      return createGoogleProvider({ mapType: "roadmap", overlayLayer: "TransitLayer" });
    }),
    createGoogleViewModel("Google Satellite", "Google satellite imagery", googleSatelliteIconUrl, () => {
      return createGoogleProvider({ mapType: "satellite" });
    }),
    createGoogleViewModel("Google Hybrid", "Google satellite imagery with roadmap overlay", googleHybridIconUrl, () => {
      return createGoogleProvider({ mapType: "hybrid" });
    }),
    createGoogleViewModel("Google Terrain", "Google terrain map", googleTerrainIconUrl, () => {
      return createGoogleProvider({ mapType: "terrain" });
    }),
  ];
}

function createGoogleViewModel(
  name: string,
  tooltip: string,
  iconUrl: string,
  creationFunction: ProviderCreationFunction,
): Cesium.ProviderViewModel {
  return new Cesium.ProviderViewModel({
    name,
    iconUrl,
    tooltip,
    category: "Google",
    creationFunction,
  });
}

function createGoogleProvider(options: GoogleMapsJsTileImageryProviderOptions): Cesium.ImageryProvider {
  return new GoogleMapsJsTileImageryProvider(options, GOOGLE_MAPS_CREDIT) as unknown as Cesium.ImageryProvider;
}
