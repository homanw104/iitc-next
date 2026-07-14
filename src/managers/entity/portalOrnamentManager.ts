/**
 * Manages portal ornament billboard primitives.
 */

import * as Cesium from "cesium";
import ap1OrnamentUrl from "../../images/ornaments/ap1.svg";
import ap1VolatileOrnamentUrl from "../../images/ornaments/ap1_v.svg";
import ap2OrnamentUrl from "../../images/ornaments/ap2.svg";
import ap2VolatileOrnamentUrl from "../../images/ornaments/ap2_v.svg";
import ap3OrnamentUrl from "../../images/ornaments/ap3.svg";
import ap3VolatileOrnamentUrl from "../../images/ornaments/ap3_v.svg";
import ap5OrnamentUrl from "../../images/ornaments/ap5.svg";
import ap5VolatileOrnamentUrl from "../../images/ornaments/ap5_v.svg";
import type { PortalData } from "../../types/iitc/portal";
import type { LayerManager } from "../layer/layerManager";
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

const CANVAS_DIMENSION = 64;
const ORNAMENT_LAYER_ID = "ornaments";
const ORNAMENT_PRIMITIVE_Z_INDEX = -10;
const ORNAMENT_IMAGE_ID_PREFIX = "portal-ornament-";

const ornamentImageCache = new Map<string, Promise<HTMLCanvasElement>>();
const svgImageCache = new Map<string, Promise<HTMLImageElement>>();

interface Ornament {
  data: PortalData;
  billboard: Cesium.Billboard;
  occlusionBillboard: Cesium.Billboard;
  positionCallback: EntityPositionCallback;
}

export class PortalOrnamentManager {
  private readonly ornaments: Map<string, Ornament> = new Map();
  private readonly ornamentsPendingCreation: Set<string> = new Set();
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
    private readonly entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager,
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.ornaments.forEach((ornament) => {
        ornament.occlusionBillboard.translucencyByDistance = this.currentTranslucencyByDistance;
      });
      if (this.ornaments.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
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

  private async updateExistingOrnament(ornament: Ornament, data: PortalData): Promise<void> {
    await this.updateOrnamentPrimitives(ornament, data);
    this.updateOrnamentPositionSubscription(ornament, data);
    ornament.data = data;
  }

  private async createAndStoreOrnament(data: PortalData): Promise<void> {
    if (this.ornamentsPendingCreation.has(data.guid)) return;

    this.ornamentsPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const { billboard, occlusionBillboard } = await this.createOrnamentPrimitives(data, primitiveId);
      const ornament: Ornament = {
        data,
        billboard,
        occlusionBillboard,
        positionCallback: (entityPosition: EntityPosition) => {
          applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
        },
      };
      this.entityPositionManager.addPositionChangedCallback(data, ornament.positionCallback);
      this.ornaments.set(data.guid, ornament);
    } finally {
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  private async createOrnamentPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    billboard: Cesium.Billboard;
    occlusionBillboard: Cesium.Billboard
  }> {
    const billboards = this.getOrnamentBillboards();
    const [entityPosition, image] = await Promise.all([
      this.entityPositionManager.getEntityPosition(data),
      getOrnamentImage(data),
    ]);

    const show = !entityPosition.isFallbackPosition;
    const billboard = addOrnamentBillboard(billboards, primitiveId, image, entityPosition.position, show);
    const occlusionBillboard = addOrnamentOcclusionBillboard(
      billboards,
      primitiveId,
      image,
      entityPosition.position,
      show,
      this.currentTranslucencyByDistance,
    );
    return { billboard, occlusionBillboard };
  }

  private async updateOrnamentPrimitives(ornament: Ornament, data: PortalData): Promise<void> {
    const [entityPosition, image] = await Promise.all([
      this.entityPositionManager.getEntityPosition(data),
      getOrnamentImage(data),
    ]);

    applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
    setOrnamentBillboardImage(ornament.billboard, data, image);
    setOrnamentBillboardImage(ornament.occlusionBillboard, data, image);
  }

  private updateOrnamentPositionSubscription(ornament: Ornament, data: PortalData): void {
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

    const billboards = this.getOrnamentBillboards();

    billboards.remove(ornamentInfo.billboard);
    billboards.remove(ornamentInfo.occlusionBillboard);

    this.entityPositionManager.removePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.ornaments.delete(guid);
    this.ornamentsPendingCreation.delete(guid);
    return true;
  }

  private removeOrnamentPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.ornaments.forEach((info, guid) => {
      const position = info.billboard.position ?? info.occlusionBillboard.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    if (toRemove.length === 0) return;

    toRemove.forEach((guid) => this.removeOrnamentPrimitive(guid));
    this.viewer.scene.requestRender();
  }

  private getOrnamentBillboards(): Cesium.BillboardCollection {
    return this.layerManager.getOrCreatePrimitiveLayer(ORNAMENT_LAYER_ID, ORNAMENT_PRIMITIVE_Z_INDEX).billboards;
  }
}

function applyOrnamentPosition(
  billboard: Cesium.Billboard,
  occlusionBillboard: Cesium.Billboard,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;
  billboard.position = entityPosition.position;
  billboard.show = show;
  occlusionBillboard.position = entityPosition.position;
  occlusionBillboard.show = show;
}

function addOrnamentBillboard(
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

function addOrnamentOcclusionBillboard(
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

function setOrnamentBillboardImage(
  billboard: Cesium.Billboard,
  data: PortalData,
  image: HTMLCanvasElement,
): void {
  billboard.setImage(getOrnamentImageId(data), image);
}

async function getOrnamentImage(data: PortalData): Promise<HTMLCanvasElement> {
  const cacheKey = getOrnamentImageCacheKey(data);
  const cached = ornamentImageCache.get(cacheKey);
  if (cached) return cached;

  const imagePromise = createOrnamentImage(data);
  ornamentImageCache.set(cacheKey, imagePromise);

  try {
    return await imagePromise;
  } catch (error) {
    ornamentImageCache.delete(cacheKey);
    throw error;
  }
}

async function createOrnamentImage(data: PortalData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_DIMENSION;
  canvas.height = CANVAS_DIMENSION;

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  if (data.ornaments?.includes("ap1")) await drawSvg(context, ap1OrnamentUrl);
  if (data.ornaments?.includes("ap1_v")) await drawSvg(context, ap1VolatileOrnamentUrl);
  if (data.ornaments?.includes("ap2")) await drawSvg(context, ap2OrnamentUrl);
  if (data.ornaments?.includes("ap2_v")) await drawSvg(context, ap2VolatileOrnamentUrl);
  if (data.ornaments?.includes("ap3")) await drawSvg(context, ap3OrnamentUrl);
  if (data.ornaments?.includes("ap3_v")) await drawSvg(context, ap3VolatileOrnamentUrl);
  if (data.ornaments?.includes("ap5")) await drawSvg(context, ap5OrnamentUrl);
  if (data.ornaments?.includes("ap5_v")) await drawSvg(context, ap5VolatileOrnamentUrl);

  return canvas;
}

async function drawSvg(context: CanvasRenderingContext2D, url: string): Promise<void> {
  const image = await loadSvgImage(url);
  context.drawImage(image, 0, 0, CANVAS_DIMENSION, CANVAS_DIMENSION);
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  const cached = svgImageCache.get(url);
  if (cached) return cached;

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      svgImageCache.delete(url);
      reject(new Error(`Failed to load portal ornament SVG: ${url}`));
    };
    image.src = url;
  });
  svgImageCache.set(url, imagePromise);
  return imagePromise;
}

function getOrnamentImageId(data: PortalData): string {
  return `${ORNAMENT_IMAGE_ID_PREFIX}${getOrnamentImageCacheKey(data)}`;
}

function getOrnamentImageCacheKey(data: PortalData): string {
  return (data.ornaments || []).toString();
}
