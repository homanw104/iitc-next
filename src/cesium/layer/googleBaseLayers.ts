/**
 * Creates Google imagery layer choices for the Cesium base layer picker.
 */

import * as Cesium from "cesium";
import {
  GoogleMapsJsTileImageryProvider,
  type GoogleMapsJsStyle,
  type GoogleMapsJsTileImageryProviderOptions,
} from "../imagery/googleMapsJsTileImageryProvider.ts";

type ProviderCreationFunction = Cesium.ProviderViewModel.CreationFunction;

const GOOGLE_ROADMAP_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/googleRoadmap.png");
const GOOGLE_SATELLITE_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/googleSatellite.png");
const GOOGLE_HYBRID_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/googleSatelliteLabels.png");
const GOOGLE_TERRAIN_ICON_URL = Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/googleContour.png");
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
    createGoogleViewModel("Google Ingress Map", "Google roadmap styled like the stock Ingress Intel map", GOOGLE_ROADMAP_ICON_URL, () => {
      return createGoogleProvider({ mapType: "roadmap", styles: GOOGLE_INGRESS_MAP_STYLES });
    }),
    createGoogleViewModel("Google Roads", "Google roadmap", GOOGLE_ROADMAP_ICON_URL, () => {
      return createGoogleProvider({ mapType: "roadmap" });
    }),
    createGoogleViewModel("Google Roads Traffic", "Google roadmap with traffic overlay", GOOGLE_ROADMAP_ICON_URL, () => {
      return createGoogleProvider({ mapType: "roadmap", overlayLayer: "TrafficLayer" });
    }),
    createGoogleViewModel("Google Roads Transit", "Google roadmap with transit overlay", GOOGLE_ROADMAP_ICON_URL, () => {
      return createGoogleProvider({ mapType: "roadmap", overlayLayer: "TransitLayer" });
    }),
    createGoogleViewModel("Google Satellite", "Google satellite imagery", GOOGLE_SATELLITE_ICON_URL, () => {
      return createGoogleProvider({ mapType: "satellite" });
    }),
    createGoogleViewModel("Google Hybrid", "Google satellite imagery with roadmap overlay", GOOGLE_HYBRID_ICON_URL, () => {
      return createGoogleProvider({ mapType: "hybrid" });
    }),
    createGoogleViewModel("Google Terrain", "Google terrain map", GOOGLE_TERRAIN_ICON_URL, () => {
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
