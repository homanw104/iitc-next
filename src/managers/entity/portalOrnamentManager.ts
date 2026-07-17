/**
 * Manages portal ornament billboard primitives.
 */

import * as Cesium from "cesium";
import { GM_xmlhttpRequest, monkeyWindow } from "vite-plugin-monkey/dist/client";
import ap1OrnamentUrl from "../../images/ornaments/ap1.svg";
import ap1VolatileOrnamentUrl from "../../images/ornaments/ap1_v.svg";
import ap2OrnamentUrl from "../../images/ornaments/ap2.svg";
import ap2VolatileOrnamentUrl from "../../images/ornaments/ap2_v.svg";
import ap3OrnamentUrl from "../../images/ornaments/ap3.svg";
import ap3VolatileOrnamentUrl from "../../images/ornaments/ap3_v.svg";
import ap4OrnamentUrl from "../../images/ornaments/ap4.svg";
import ap4VolatileOrnamentUrl from "../../images/ornaments/ap4_v.svg";
import ap5OrnamentUrl from "../../images/ornaments/ap5.svg";
import ap5VolatileOrnamentUrl from "../../images/ornaments/ap5_v.svg";
import ap6OrnamentUrl from "../../images/ornaments/ap6.svg";
import ap6VolatileOrnamentUrl from "../../images/ornaments/ap6_v.svg";
import ap7OrnamentUrl from "../../images/ornaments/ap7.svg";
import ap7VolatileOrnamentUrl from "../../images/ornaments/ap7_v.svg";
import ap8OrnamentUrl from "../../images/ornaments/ap8.svg";
import ap8VolatileOrnamentUrl from "../../images/ornaments/ap8_v.svg";
import battleBeaconScheduledOrnamentUrl from "../../images/ornaments/bb_s.svg";
import aegisNovaBeaconUrl from "../../images/ornaments/peAEGISNOVA.png";
import blackLivesMatterBeaconUrl from "../../images/ornaments/peBN_BLM.png";
import enlightenedWinnerBeaconUrl from "../../images/ornaments/peBN_ENL_WINNER.png";
import monsterHunterNowLogoBeaconUrl from "../../images/ornaments/peBN_MHN_LOGO.png";
import peaceBeaconUrl from "../../images/ornaments/peBN_PEACE.png";
import resistanceWinnerBeaconUrl from "../../images/ornaments/peBN_RES_WINNER.png";
import enlightenedBeaconUrl from "../../images/ornaments/peENL.png";
import lookBeaconUrl from "../../images/ornaments/peLOOK.png";
import magnusReawakensBeaconUrl from "../../images/ornaments/peMAGNUSRE.png";
import meetBeaconUrl from "../../images/ornaments/peMEET.png";
import nemesisBeaconUrl from "../../images/ornaments/peNEMESIS.png";
import nianticBeaconUrl from "../../images/ornaments/peNIA.png";
import obsidianBeaconUrl from "../../images/ornaments/peOBSIDIAN.png";
import resistanceBeaconUrl from "../../images/ornaments/peRES.png";
import toastyBeaconUrl from "../../images/ornaments/peTOASTY.png";
import viaLuxBeaconUrl from "../../images/ornaments/peVIALUX.png";
import viaNoirBeaconUrl from "../../images/ornaments/peVIANOIR.png";
import type { PortalData } from "../../types/iitc/portal";
import type { LayerManager } from "../layer/layerManager";
import { logManager } from "../system/logManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  createPortalNearFarScalar,
  createPortalPrimitiveId,
  getPortalDisableDepthTestDistance,
  type PortalPrimitiveId,
} from "./portalManager";

const MARKER_CANVAS_DIMENSION = 64;
const BEACON_CANVAS_DIMENSION = 256;
const BEACON_BOTTOM_HEIGHT_METERS = 24;
const BEACON_PANEL_WIDTH_METERS = 18;
const BEACON_PANEL_HEIGHT_METERS = 18;
const BEACON_CONNECTOR_DIAMETER_METERS = 0.5;
const BEACON_CONNECTOR_OVERLAP_METERS = 1.5;
const BEACON_CONNECTOR_COLOR = Cesium.Color.fromCssColorString("#fcea31").withAlpha(0.6);
const ORNAMENT_LAYER_ID = "ornaments";
const ORNAMENT_PRIMITIVE_Z_INDEX = -10;
const ORNAMENT_OVERLAY_Z_INDEX = 1050;
const REMOTE_ORNAMENT_IMAGE_BASE_URL = "https://commondatastorage.googleapis.com/ingress.com/img/map_icons/marker_images/";
const REMOTE_ORNAMENT_IMAGE_TIMEOUT_MS = 15_000;
const LOG_TAG = "PortalOrnamentManager";

// Listed marker ornaments use bundled images. Every unlisted ornament is also a marker,
// but its image is fetched from the stock Ingress ornament endpoint.
const MARKER_ORNAMENT_URLS: Readonly<Record<string, string>> = {
  ap1: ap1OrnamentUrl,
  ap1_v: ap1VolatileOrnamentUrl,
  ap2: ap2OrnamentUrl,
  ap2_v: ap2VolatileOrnamentUrl,
  ap3: ap3OrnamentUrl,
  ap3_v: ap3VolatileOrnamentUrl,
  ap4: ap4OrnamentUrl,
  ap4_v: ap4VolatileOrnamentUrl,
  ap5: ap5OrnamentUrl,
  ap5_v: ap5VolatileOrnamentUrl,
  ap6: ap6OrnamentUrl,
  ap6_v: ap6VolatileOrnamentUrl,
  ap7: ap7OrnamentUrl,
  ap7_v: ap7VolatileOrnamentUrl,
  ap8: ap8OrnamentUrl,
  ap8_v: ap8VolatileOrnamentUrl,
  bb_s: battleBeaconScheduledOrnamentUrl,
};

// Only explicitly listed ornaments are rendered as elevated beacons.
const BEACON_ORNAMENT_URLS: Readonly<Record<string, string>> = {
  peAEGISNOVA: aegisNovaBeaconUrl,
  peBN_BLM: blackLivesMatterBeaconUrl,
  peBN_ENL_WINNER: enlightenedWinnerBeaconUrl,
  peBN_MHN_LOGO: monsterHunterNowLogoBeaconUrl,
  peBN_PEACE: peaceBeaconUrl,
  peBN_RES_WINNER: resistanceWinnerBeaconUrl,
  peENL: enlightenedBeaconUrl,
  peLOOK: lookBeaconUrl,
  peMAGNUSRE: magnusReawakensBeaconUrl,
  peMEET: meetBeaconUrl,
  peNEMESIS: nemesisBeaconUrl,
  peNIA: nianticBeaconUrl,
  peOBSIDIAN: obsidianBeaconUrl,
  peRES: resistanceBeaconUrl,
  peTOASTY: toastyBeaconUrl,
  peVIALUX: viaLuxBeaconUrl,
  peVIANOIR: viaNoirBeaconUrl,
};

type UserscriptWindow = Window & {
  GM?: {
    xmlHttpRequest?: typeof GM_xmlhttpRequest,
  },
  GM_xmlhttpRequest?: typeof GM_xmlhttpRequest,
};

type OrnamentKind = "marker" | "beacon";

const ornamentImageCache = new Map<string, Promise<HTMLCanvasElement>>();
const sourceImageCache = new Map<string, Promise<HTMLImageElement>>();

interface MarkerOrnamentPrimitives {
  billboard: Cesium.Billboard;
  occlusionBillboard: Cesium.Billboard;
}

interface BeaconOrnamentPrimitives {
  panel: Cesium.Primitive;
  connector: Cesium.Primitive;
  panelCenter: Cesium.Cartesian3;
  panelUp: Cesium.Cartesian3;
}

interface PortalOrnament {
  data: PortalData;
  primitiveId: PortalPrimitiveId;
  marker: MarkerOrnamentPrimitives | undefined;
  beacon: BeaconOrnamentPrimitives | undefined;
  positionCallback: EntityPositionCallback;
}

type PortalOrnamentPrimitiveGroups = Pick<PortalOrnament, "marker" | "beacon">;

export class PortalOrnamentManager {
  private readonly ornaments: Map<string, PortalOrnament> = new Map();
  private readonly ornamentsPendingCreation: Set<string> = new Set();

  // Secondary index used by camera updates so marker-only ornaments are never scanned.
  private readonly activeBeaconOrnaments: Set<BeaconOrnamentPrimitives> = new Set();

  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;
  private readonly lastBeaconCameraDirection = new Cesium.Cartesian3();
  private hasBeaconCameraDirection = false;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
    private readonly entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager,
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.ornaments.forEach((ornament) => {
        if (ornament.marker) {
          ornament.marker.occlusionBillboard.translucencyByDistance = this.currentTranslucencyByDistance;
        }
      });
      if (this.ornaments.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
    this.viewer.scene.preUpdate.addEventListener(this.updateBeaconPanelHeadings);
  }

  public async addOrUpdateOrnaments(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateOrnament(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateOrnament(data: PortalData): Promise<void> {
    if (!data.ornaments?.length) {
      this.removeOrnamentPrimitive(data.guid);
      this.viewer.scene.requestRender();
      return;
    }

    const existing = this.ornaments.get(data.guid);
    if (existing) {
      await this.updateExistingOrnament(existing, data);
    } else {
      await this.createAndStoreOrnament(data);
    }
    this.viewer.scene.requestRender();
  }

  public removeOrnament(guid: string): void {
    if (this.removeOrnamentPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeOrnamentsInView(viewRect: Cesium.Rectangle): void {
    this.removeOrnamentPrimitivesInView(viewRect);
  }

  private async updateExistingOrnament(ornament: PortalOrnament, data: PortalData): Promise<void> {
    const nextPrimitives = await this.createOrnamentPrimitiveGroups(data, ornament.primitiveId);
    this.removeOrnamentPrimitiveGroups(ornament);
    ornament.marker = nextPrimitives.marker;
    ornament.beacon = nextPrimitives.beacon;
    if (ornament.beacon) this.activeBeaconOrnaments.add(ornament.beacon);
    this.updateOrnamentPositionSubscription(ornament, data);
    ornament.data = data;
  }

  private async createAndStoreOrnament(data: PortalData): Promise<void> {
    if (this.ornamentsPendingCreation.has(data.guid)) return;

    this.ornamentsPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const { marker, beacon } = await this.createOrnamentPrimitiveGroups(data, primitiveId);
      const ornament: PortalOrnament = {
        data,
        primitiveId,
        marker,
        beacon,
        positionCallback: (entityPosition: EntityPosition) => {
          applyOrnamentPosition(ornament, entityPosition, this.viewer.camera.directionWC);
        },
      };
      this.entityPositionManager.addPositionChangedCallback(data, ornament.positionCallback);
      this.ornaments.set(data.guid, ornament);
      if (beacon) this.activeBeaconOrnaments.add(beacon);
    } finally {
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  private async createOrnamentPrimitiveGroups(
    data: PortalData,
    primitiveId: PortalPrimitiveId,
  ): Promise<PortalOrnamentPrimitiveGroups> {
    const { markerIds, beaconIds } = classifyOrnaments(data.ornaments || []);
    const [entityPosition, markerImage, beaconImage] = await Promise.all([
      this.entityPositionManager.getEntityPosition(data),
      markerIds.length > 0 ? getOrnamentImage("marker", markerIds) : undefined,
      beaconIds.length > 0 ? getOrnamentImage("beacon", beaconIds) : undefined,
    ]);

    const show = !entityPosition.isFallbackPosition;
    const marker = markerImage
      ? createMarkerOrnamentPrimitives(
        this.getMarkerBillboards(),
        primitiveId,
        markerImage,
        entityPosition.position,
        show,
        this.currentTranslucencyByDistance,
      )
      : undefined;
    const beacon = beaconImage
      ? createBeaconOrnamentPrimitives(
        this.getBeaconOverlayLayer().collection,
        primitiveId,
        beaconImage,
        entityPosition,
        this.viewer.camera.directionWC,
      )
      : undefined;
    return { marker, beacon };
  }

  private updateOrnamentPositionSubscription(ornament: PortalOrnament, data: PortalData): void {
    if (ornament.data.latE6 === data.latE6 && ornament.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.removePositionChangedCallback(ornament.data, ornament.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, ornament.positionCallback);
  }

  private removeOrnamentPrimitive(guid: string): boolean {
    const ornamentInfo = this.ornaments.get(guid);
    if (!ornamentInfo) {
      this.ornamentsPendingCreation.delete(guid);
      return false;
    }

    this.removeOrnamentPrimitiveGroups(ornamentInfo);

    this.entityPositionManager.removePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.ornaments.delete(guid);
    this.ornamentsPendingCreation.delete(guid);
    return true;
  }

  private removeOrnamentPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.ornaments.forEach((info, guid) => {
      const cartographic = Cesium.Cartographic.fromDegrees(info.data.lngE6 / 1e6, info.data.latE6 / 1e6);
      if (Cesium.Rectangle.contains(viewRect, cartographic)) toRemove.push(guid);
    });
    if (toRemove.length === 0) return;

    toRemove.forEach((guid) => this.removeOrnamentPrimitive(guid));
    this.viewer.scene.requestRender();
  }

  private removeOrnamentPrimitiveGroups(ornament: PortalOrnament): void {
    if (ornament.marker) {
      const billboards = this.getMarkerBillboards();
      billboards.remove(ornament.marker.billboard);
      billboards.remove(ornament.marker.occlusionBillboard);
      ornament.marker = undefined;
    }
    if (ornament.beacon) {
      this.activeBeaconOrnaments.delete(ornament.beacon);
      this.getBeaconOverlayLayer().removePrimitive(ornament.beacon.panel);
      this.getBeaconOverlayLayer().removePrimitive(ornament.beacon.connector);
      ornament.beacon = undefined;
    }
  }

  private getMarkerBillboards(): Cesium.BillboardCollection {
    return this.layerManager.getOrCreatePrimitiveLayer(ORNAMENT_LAYER_ID, ORNAMENT_PRIMITIVE_Z_INDEX).billboards;
  }

  private getBeaconOverlayLayer() {
    return this.layerManager.getOrCreateOverlayLayer(ORNAMENT_LAYER_ID, ORNAMENT_OVERLAY_Z_INDEX);
  }

  private readonly updateBeaconPanelHeadings = (): void => {
    if (this.activeBeaconOrnaments.size === 0) return;

    const cameraDirection = this.viewer.camera.directionWC;
    if (this.hasBeaconCameraDirection && Cesium.Cartesian3.equals(cameraDirection, this.lastBeaconCameraDirection)) {
      return;
    }

    Cesium.Cartesian3.clone(cameraDirection, this.lastBeaconCameraDirection);
    this.hasBeaconCameraDirection = true;
    this.activeBeaconOrnaments.forEach((beacon) => {
      if (!beacon.panel.show) return;
      beacon.panel.modelMatrix = createBeaconPanelModelMatrix(
        beacon.panelCenter,
        beacon.panelUp,
        cameraDirection,
        beacon.panel.modelMatrix,
      );
    });
  };
}

function applyOrnamentPosition(
  ornament: PortalOrnament,
  entityPosition: EntityPosition,
  cameraDirection: Cesium.Cartesian3,
): void {
  const show = !entityPosition.isFallbackPosition;
  if (ornament.marker) {
    ornament.marker.billboard.position = entityPosition.position;
    ornament.marker.billboard.show = show;
    ornament.marker.occlusionBillboard.position = entityPosition.position;
    ornament.marker.occlusionBillboard.show = show;
  }
  if (ornament.beacon) {
    Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(entityPosition.position, ornament.beacon.panelUp);
    getBeaconPanelCenter(entityPosition.position, ornament.beacon.panelUp, ornament.beacon.panelCenter);
    ornament.beacon.panel.modelMatrix = createBeaconPanelModelMatrix(
      ornament.beacon.panelCenter,
      ornament.beacon.panelUp,
      cameraDirection,
      ornament.beacon.panel.modelMatrix,
    );
    ornament.beacon.panel.show = show;
    ornament.beacon.connector.modelMatrix = createBeaconConnectorModelMatrix(entityPosition.position);
    ornament.beacon.connector.show = show;
  }
}

function createMarkerOrnamentPrimitives(
  billboards: Cesium.BillboardCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  position: Cesium.Cartesian3,
  show: boolean,
  translucencyByDistance: Cesium.NearFarScalar,
): MarkerOrnamentPrimitives {
  return {
    billboard: addMarkerOrnamentBillboard(billboards, primitiveId, image, position, show),
    occlusionBillboard: addMarkerOrnamentOcclusionBillboard(
      billboards,
      primitiveId,
      image,
      position,
      show,
      translucencyByDistance,
    ),
  };
}

function addMarkerOrnamentBillboard(
  billboards: Cesium.BillboardCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  position: Cesium.Cartesian3,
  show: boolean,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image,
    heightReference: Cesium.HeightReference.NONE,
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: createPortalNearFarScalar(),
  });
}

function addMarkerOrnamentOcclusionBillboard(
  billboards: Cesium.BillboardCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  position: Cesium.Cartesian3,
  show: boolean,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image,
    color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
    heightReference: Cesium.HeightReference.NONE,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
  });
}

function createBeaconOrnamentPrimitives(
  overlayPrimitives: Cesium.PrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  entityPosition: EntityPosition,
  cameraDirection: Cesium.Cartesian3,
): BeaconOrnamentPrimitives {
  const show = !entityPosition.isFallbackPosition;
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(entityPosition.position, new Cesium.Cartesian3());
  const center = getBeaconPanelCenter(entityPosition.position, up);
  const panel = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      id: primitiveId,
      geometry: new Cesium.PlaneGeometry({
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: Cesium.Material.fromType(Cesium.Material.ImageType, { image }),
      translucent: true,
      closed: false,
      faceForward: false,
      flat: true,
    }),
    modelMatrix: createBeaconPanelModelMatrix(center, up, cameraDirection),
    asynchronous: false,
    show,
  });
  const connectorHeight = BEACON_BOTTOM_HEIGHT_METERS + BEACON_CONNECTOR_OVERLAP_METERS;
  const connectorRadius = BEACON_CONNECTOR_DIAMETER_METERS / 2;
  const connector = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      id: primitiveId,
      geometry: new Cesium.CylinderGeometry({
        length: connectorHeight,
        topRadius: connectorRadius,
        bottomRadius: connectorRadius,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(BEACON_CONNECTOR_COLOR),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({
      translucent: true,
      closed: true,
      flat: true,
    }),
    modelMatrix: createBeaconConnectorModelMatrix(entityPosition.position),
    asynchronous: false,
    show,
  });
  return {
    panel: overlayPrimitives.add(panel),
    connector: overlayPrimitives.add(connector),
    panelCenter: center,
    panelUp: up,
  };
}

function getBeaconPanelCenter(
  portalPosition: Cesium.Cartesian3,
  up: Cesium.Cartesian3,
  result: Cesium.Cartesian3 = new Cesium.Cartesian3(),
): Cesium.Cartesian3 {
  Cesium.Cartesian3.multiplyByScalar(
    up,
    BEACON_BOTTOM_HEIGHT_METERS + BEACON_PANEL_HEIGHT_METERS / 2,
    result,
  );
  return Cesium.Cartesian3.add(portalPosition, result, result);
}

const beaconVerticalScratch = new Cesium.Cartesian3();
const beaconFacingScratch = new Cesium.Cartesian3();
const beaconRightScratch = new Cesium.Cartesian3();
const beaconRotationScratch = new Cesium.Matrix3();
const beaconPanelScale = new Cesium.Cartesian3(BEACON_PANEL_WIDTH_METERS, BEACON_PANEL_HEIGHT_METERS, 1);

function createBeaconPanelModelMatrix(
  center: Cesium.Cartesian3,
  up: Cesium.Cartesian3,
  cameraDirection: Cesium.Cartesian3,
  result: Cesium.Matrix4 = new Cesium.Matrix4(),
): Cesium.Matrix4 {
  Cesium.Cartesian3.negate(cameraDirection, beaconFacingScratch);
  const verticalDistance = Cesium.Cartesian3.dot(beaconFacingScratch, up);
  Cesium.Cartesian3.multiplyByScalar(up, verticalDistance, beaconVerticalScratch);
  Cesium.Cartesian3.subtract(beaconFacingScratch, beaconVerticalScratch, beaconFacingScratch);

  if (Cesium.Cartesian3.magnitudeSquared(beaconFacingScratch) <= Cesium.Math.EPSILON6) {
    return createFixedBeaconPanelModelMatrix(center, result);
  }

  Cesium.Cartesian3.normalize(beaconFacingScratch, beaconFacingScratch);
  Cesium.Cartesian3.cross(up, beaconFacingScratch, beaconRightScratch);
  Cesium.Cartesian3.normalize(beaconRightScratch, beaconRightScratch);
  Cesium.Matrix3.setColumn(beaconRotationScratch, 0, beaconRightScratch, beaconRotationScratch);
  Cesium.Matrix3.setColumn(beaconRotationScratch, 1, up, beaconRotationScratch);
  Cesium.Matrix3.setColumn(beaconRotationScratch, 2, beaconFacingScratch, beaconRotationScratch);
  Cesium.Matrix4.fromRotationTranslation(beaconRotationScratch, center, result);
  return Cesium.Matrix4.multiplyByScale(result, beaconPanelScale, result);
}

function createFixedBeaconPanelModelMatrix(center: Cesium.Cartesian3, result: Cesium.Matrix4): Cesium.Matrix4 {
  const eastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const verticalPlane = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationX(Cesium.Math.PI_OVER_TWO),
  );
  Cesium.Matrix4.multiply(eastNorthUp, verticalPlane, result);
  return Cesium.Matrix4.multiplyByScale(result, beaconPanelScale, result);
}

function createBeaconConnectorModelMatrix(portalPosition: Cesium.Cartesian3): Cesium.Matrix4 {
  const connectorHeight = BEACON_BOTTOM_HEIGHT_METERS + BEACON_CONNECTOR_OVERLAP_METERS;
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(portalPosition, new Cesium.Cartesian3());
  const centerOffset = Cesium.Cartesian3.multiplyByScalar(up, connectorHeight / 2, new Cesium.Cartesian3());
  const center = Cesium.Cartesian3.add(portalPosition, centerOffset, new Cesium.Cartesian3());
  return Cesium.Transforms.eastNorthUpToFixedFrame(center);
}

function classifyOrnaments(ornamentIds: string[]): { markerIds: string[]; beaconIds: string[] } {
  const markerIds: string[] = [];
  const beaconIds: string[] = [];

  for (const ornamentId of new Set(ornamentIds)) {
    if (Object.hasOwn(BEACON_ORNAMENT_URLS, ornamentId)) beaconIds.push(ornamentId);
    else markerIds.push(ornamentId);
  }
  markerIds.sort();
  beaconIds.sort();
  return { markerIds, beaconIds };
}

async function getOrnamentImage(kind: OrnamentKind, ornamentIds: string[]): Promise<HTMLCanvasElement> {
  const cacheKey = getOrnamentImageCacheKey(kind, ornamentIds);
  const cached = ornamentImageCache.get(cacheKey);
  if (cached) return cached;

  const imagePromise = createOrnamentImage(kind, ornamentIds);
  ornamentImageCache.set(cacheKey, imagePromise);

  try {
    return await imagePromise;
  } catch (error) {
    ornamentImageCache.delete(cacheKey);
    throw error;
  }
}

async function createOrnamentImage(kind: OrnamentKind, ornamentIds: string[]): Promise<HTMLCanvasElement> {
  const dimension = kind === "beacon" ? BEACON_CANVAS_DIMENSION : MARKER_CANVAS_DIMENSION;
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const localOrnamentUrls = kind === "beacon" ? BEACON_ORNAMENT_URLS : MARKER_ORNAMENT_URLS;
  for (const ornamentId of ornamentIds) {
    const localUrl = Object.hasOwn(localOrnamentUrls, ornamentId)
      ? localOrnamentUrls[ornamentId]
      : undefined;
    const imageUrl = localUrl || getRemoteOrnamentImageUrl(ornamentId);
    try {
      await drawOrnamentImage(context, imageUrl, !localUrl, dimension);
    } catch (error) {
      logManager.warn(LOG_TAG, `Failed to load ornament image for ${ornamentId}`, error);
    }
  }

  return canvas;
}

async function drawOrnamentImage(
  context: CanvasRenderingContext2D,
  url: string,
  isRemote: boolean,
  dimension: number,
): Promise<void> {
  const image = await loadSourceImage(url, isRemote);
  context.drawImage(image, 0, 0, dimension, dimension);
}

function loadSourceImage(url: string, isRemote: boolean): Promise<HTMLImageElement> {
  const cached = sourceImageCache.get(url);
  if (cached) return cached;

  const imagePromise = (isRemote ? loadRemoteSourceImage(url) : loadImage(url))
    .catch((error: unknown) => {
      sourceImageCache.delete(url);
      throw error;
    });
  sourceImageCache.set(url, imagePromise);
  return imagePromise;
}

async function loadRemoteSourceImage(url: string): Promise<HTMLImageElement> {
  const blob = await fetchRemoteOrnamentImage(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    // Local ornament imports are served from Vite's development origin while the
    // userscript runs on intel.ingress.com. Request them in CORS mode, so drawing
    // them into the composition canvas does not taint it for Cesium/WebGL.
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load portal ornament image: ${url}`));
    image.src = url;
  });
}

async function fetchRemoteOrnamentImage(url: string): Promise<Blob> {
  const userscriptRequest = getUserscriptXmlHttpRequest();
  if (!userscriptRequest) {
    throw new Error("GM_xmlhttpRequest is not available for portal ornament image loading.");
  }
  return fetchRemoteOrnamentImageWithUserscript(userscriptRequest, url);
}

function getUserscriptXmlHttpRequest(): typeof GM_xmlhttpRequest | undefined {
  if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;
  if (typeof monkeyWindow.GM_xmlhttpRequest === "function") return monkeyWindow.GM_xmlhttpRequest;
  if (typeof monkeyWindow.GM?.xmlHttpRequest === "function") {
    return monkeyWindow.GM.xmlHttpRequest as typeof GM_xmlhttpRequest;
  }

  const userscriptWindow = getMountedUserscriptWindow();
  if (typeof userscriptWindow?.GM_xmlhttpRequest === "function") {
    return userscriptWindow.GM_xmlhttpRequest;
  }
  if (typeof userscriptWindow?.GM?.xmlHttpRequest === "function") {
    return userscriptWindow.GM.xmlHttpRequest as typeof GM_xmlhttpRequest;
  }
  return undefined;
}

function getMountedUserscriptWindow(): UserscriptWindow | undefined {
  for (const key of Object.getOwnPropertyNames(document)) {
    if (!key.startsWith("__monkeyWindow-")) continue;

    const value = (document as unknown as Record<string, unknown>)[key];
    if (typeof value === "object" && value !== null) return value as UserscriptWindow;
  }
  return undefined;
}

function fetchRemoteOrnamentImageWithUserscript(
  userscriptRequest: typeof GM_xmlhttpRequest,
  url: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    userscriptRequest<"blob">({
      method: "GET",
      url,
      responseType: "blob",
      anonymous: true,
      timeout: REMOTE_ORNAMENT_IMAGE_TIMEOUT_MS,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300 && isBlob(response.response)) {
          resolve(response.response);
        } else {
          reject(new Error(`Failed to fetch portal ornament image: ${response.status}`));
        }
      },
      onerror: () => reject(new Error(`Failed to fetch portal ornament image: ${url}`)),
      ontimeout: () => reject(new Error(`Timed out fetching portal ornament image: ${url}`)),
    });
  });
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob || Object.prototype.toString.call(value) === "[object Blob]";
}

function getRemoteOrnamentImageUrl(ornamentId: string): string {
  return `${REMOTE_ORNAMENT_IMAGE_BASE_URL}${encodeURIComponent(ornamentId)}.png`;
}

function getOrnamentImageCacheKey(kind: OrnamentKind, ornamentIds: string[]): string {
  return `${kind}:${JSON.stringify(ornamentIds)}`;
}
