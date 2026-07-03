/**
 * Runtime bridge for the Vite alias from "cesium" to this file.
 *
 * loadCesiumScript() first injects Cesium's UMD bundle, which populates
 * safeWindow.Cesium; this bridge then forwards existing "cesium" imports to it.
 *
 * Named exports stay explicit because ES module exports must be known at build time.
 */

import { safeWindow } from "../../utils/window.ts";

type CesiumType = typeof import("cesium");
type CesiumTypeWithPrivateRenderer = CesiumType & {
  RenderState: unknown;
};
type WindowWithCesium = Window & typeof globalThis & {
  Cesium?: CesiumType;
};

const getCesium = (): CesiumType => {
  const cesium = (safeWindow as WindowWithCesium).Cesium;
  if (!cesium) throw new Error("Cesium has not been loaded");
  return cesium;
};

const Cesium = getCesium();

export default Cesium;

export const ArcType = Cesium.ArcType;
export const CallbackProperty = Cesium.CallbackProperty;
export const Camera = Cesium.Camera;
export const CameraEventType = Cesium.CameraEventType;
export const Cartesian2 = Cesium.Cartesian2;
export const Cartesian3 = Cesium.Cartesian3;
export const Cartographic = Cesium.Cartographic;
export const Cesium3DTileStyle = Cesium.Cesium3DTileStyle;
export const Cesium3DTileset = Cesium.Cesium3DTileset;
export const ClassificationType = Cesium.ClassificationType;
export const Color = Cesium.Color;
export const ColorMaterialProperty = Cesium.ColorMaterialProperty;
export const ConstantPositionProperty = Cesium.ConstantPositionProperty;
export const ConstantProperty = Cesium.ConstantProperty;
export const Credit = Cesium.Credit;
export const CustomDataSource = Cesium.CustomDataSource;
export const DataSource = Cesium.DataSource;
export const DataSourceCollection = Cesium.DataSourceCollection;
export const DataSourceDisplay = Cesium.DataSourceDisplay;
export const EllipsoidTerrainProvider = Cesium.EllipsoidTerrainProvider;
export const Entity = Cesium.Entity;
export const EntityCollection = Cesium.EntityCollection;
export const Event = Cesium.Event;
export const Google2DImageryProvider = Cesium.Google2DImageryProvider;
export const GoogleMaps = Cesium.GoogleMaps;
export const HeightReference = Cesium.HeightReference;
export const HorizontalOrigin = Cesium.HorizontalOrigin;
export const Ion = Cesium.Ion;
export const IonGeocodeProviderType = Cesium.IonGeocodeProviderType;
export const ImageryLayer = Cesium.ImageryLayer;
export const JulianDate = Cesium.JulianDate;
export const KeyboardEventModifier = Cesium.KeyboardEventModifier;
export const LabelStyle = Cesium.LabelStyle;
export const Math = Cesium.Math;
export const Matrix4 = Cesium.Matrix4;
export const NearFarScalar = Cesium.NearFarScalar;
export const PolygonHierarchy = Cesium.PolygonHierarchy;
export const PolylineDashMaterialProperty = Cesium.PolylineDashMaterialProperty;
export const ProviderViewModel = Cesium.ProviderViewModel;
export const Ray = Cesium.Ray;
export const Rectangle = Cesium.Rectangle;
export const RenderState = (Cesium as CesiumTypeWithPrivateRenderer).RenderState;
export const RequestScheduler = Cesium.RequestScheduler;
export const SceneTransforms = Cesium.SceneTransforms;
export const ScreenSpaceEventHandler = Cesium.ScreenSpaceEventHandler;
export const ScreenSpaceEventType = Cesium.ScreenSpaceEventType;
export const Transforms = Cesium.Transforms;
export const UrlTemplateImageryProvider = Cesium.UrlTemplateImageryProvider;
export const VerticalOrigin = Cesium.VerticalOrigin;
export const Viewer = Cesium.Viewer;
export const WebMercatorProjection = Cesium.WebMercatorProjection;
export const WebMercatorTilingScheme = Cesium.WebMercatorTilingScheme;
export const buildModuleUrl = Cesium.buildModuleUrl;
export const createGooglePhotorealistic3DTileset = Cesium.createGooglePhotorealistic3DTileset;
export const createWorldTerrainAsync = Cesium.createWorldTerrainAsync;
export const defined = Cesium.defined;
export const sampleTerrain = Cesium.sampleTerrain;
export const sampleTerrainMostDetailed = Cesium.sampleTerrainMostDetailed;
