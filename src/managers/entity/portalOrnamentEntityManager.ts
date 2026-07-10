/**
 * Manage portal ornament billboard primitives.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal.ts";
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
} from "./portalEntityManager.ts";
import { getPortalOrnamentEntityLayerId } from "./portalEntityLayers";

const AP1_ORNAMENT_SIZE = 16;
const AP1_ORNAMENT_HOLLOW_SIZE = 8;
const AP1_ORNAMENT_ALPHA = 0.95;
const CANVAS_DIMENSION = AP1_ORNAMENT_SIZE * 2;
const ORNAMENT_PRIMITIVE_Z_INDEX = -10;
const ORNAMENT_IMAGE_ID_PREFIX = "portal-ornament-";

const ornamentImageCache = new Map<string, HTMLCanvasElement>();

interface PortalOrnament {
  data: PortalData;
  primitiveId: PortalPrimitiveId;
  billboard: Cesium.Billboard;
  occlusionBillboard: Cesium.Billboard;
  positionCallback: EntityPositionCallback;
  currentLayerId: string;
}

export class PortalOrnamentEntityManager {
  private ornaments: Map<string, PortalOrnament> = new Map();
  private ornamentsPendingCreation: Set<string> = new Set();
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.ornaments.forEach((ornament) => {
        ornament.occlusionBillboard.translucencyByDistance = this.currentTranslucencyByDistance;
      });
      if (this.ornaments.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.setOnTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateOrnaments(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateOrnamentPrimitive(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateOrnament(data: PortalData): Promise<void> {
    await this.addOrUpdateOrnamentPrimitive(data);
    this.viewer.scene.requestRender();
  }

  public removeOrnament(guid: string): void {
    if (this.removeOrnamentPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeOrnamentsInView(viewRect: Cesium.Rectangle): void {
    this.removeOrnamentPrimitivesInView(viewRect);
  }

  private async addOrUpdateOrnamentPrimitive(data: PortalData): Promise<void> {
    if (!data.ornaments?.length) {
      this.removeOrnamentPrimitive(data.guid);
      return;
    }

    const existing = this.ornaments.get(data.guid);
    if (existing) {
      await this.updateExistingOrnament(existing, data);
    } else {
      await this.createAndStoreOrnament(data);
    }
  }

  private async updateExistingOrnament(ornament: PortalOrnament, data: PortalData): Promise<void> {
    this.moveOrnamentToLayer(ornament, getPortalOrnamentEntityLayerId(data));
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
      const ornament: PortalOrnament = {
        data,
        primitiveId,
        billboard,
        occlusionBillboard,
        positionCallback: (entityPosition: EntityPosition) => {
          applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
        },
        currentLayerId: getPortalOrnamentEntityLayerId(data),
      };
      this.entityPositionManager.setOnPositionChangedCallback(data, ornament.positionCallback);
      this.ornaments.set(data.guid, ornament);
    } finally {
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  private async createOrnamentPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    billboard: Cesium.Billboard;
    occlusionBillboard: Cesium.Billboard
  }> {
    const layerId = getPortalOrnamentEntityLayerId(data);
    const billboards = this.getOrnamentBillboards(layerId);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    const show = !entityPosition.isFallbackPosition;
    const billboard = addOrnamentBillboard(billboards, primitiveId, data, entityPosition.position, show);
    const occlusionBillboard = addOrnamentOcclusionBillboard(
      billboards,
      primitiveId,
      data,
      entityPosition.position,
      show,
      this.currentTranslucencyByDistance,
    );
    return { billboard, occlusionBillboard };
  }

  private async updateOrnamentPrimitives(ornament: PortalOrnament, data: PortalData): Promise<void> {
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
    setOrnamentBillboardImage(ornament.billboard, data);
    setOrnamentBillboardImage(ornament.occlusionBillboard, data);
  }

  private updateOrnamentPositionSubscription(ornament: PortalOrnament, data: PortalData): void {
    if (ornament.data.latE6 === data.latE6 && ornament.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnPositionChangedCallback(ornament.data, ornament.positionCallback);
    this.entityPositionManager.setOnPositionChangedCallback(data, ornament.positionCallback);
  }

  private removeOrnamentPrimitive(guid: string): boolean {
    const ornamentInfo = this.ornaments.get(guid);
    if (!ornamentInfo) {
      this.ornamentsPendingCreation.delete(guid);
      return false;
    }

    const billboards = this.getOrnamentBillboards(ornamentInfo.currentLayerId);

    billboards.remove(ornamentInfo.billboard);
    billboards.remove(ornamentInfo.occlusionBillboard);

    this.entityPositionManager.unsetOnPositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
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

    toRemove.forEach(guid => this.removeOrnamentPrimitive(guid));
    this.viewer.scene.requestRender();
  }

  private moveOrnamentToLayer(ornamentInfo: PortalOrnament, newLayerId: string): void {
    if (ornamentInfo.currentLayerId === newLayerId) return;

    const billboardPosition = Cesium.Cartesian3.clone(ornamentInfo.billboard.position);
    const occlusionBillboardPosition = Cesium.Cartesian3.clone(ornamentInfo.occlusionBillboard.position);
    const billboardShow = ornamentInfo.billboard.show;
    const occlusionBillboardShow = ornamentInfo.occlusionBillboard.show;
    const oldBillboards = this.getOrnamentBillboards(ornamentInfo.currentLayerId);
    oldBillboards.remove(ornamentInfo.billboard);
    oldBillboards.remove(ornamentInfo.occlusionBillboard);

    const newBillboards = this.getOrnamentBillboards(newLayerId);
    ornamentInfo.billboard = addOrnamentBillboard(
      newBillboards,
      ornamentInfo.primitiveId,
      ornamentInfo.data,
      billboardPosition,
      billboardShow,
    );
    ornamentInfo.occlusionBillboard = addOrnamentOcclusionBillboard(
      newBillboards,
      ornamentInfo.primitiveId,
      ornamentInfo.data,
      occlusionBillboardPosition,
      occlusionBillboardShow,
      this.currentTranslucencyByDistance,
    );
    ornamentInfo.currentLayerId = newLayerId;
  }

  private getOrnamentBillboards(layerId: string): Cesium.BillboardCollection {
    return this.layerManager.getOrCreatePrimitiveLayer(layerId, ORNAMENT_PRIMITIVE_Z_INDEX).billboards;
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
  data: PortalData,
  position: Cesium.Cartesian3,
  show: boolean,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image: getOrnamentImage(data),
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
  data: PortalData,
  position: Cesium.Cartesian3,
  show: boolean,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image: getOrnamentImage(data),
    color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
    heightReference: Cesium.HeightReference.NONE,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
  });
}

function setOrnamentBillboardImage(billboard: Cesium.Billboard, data: PortalData): void {
  billboard.setImage(getOrnamentImageId(data), getOrnamentImage(data));
}

function getOrnamentImage(data: PortalData): HTMLCanvasElement {
  const cacheKey = getOrnamentImageCacheKey(data);
  const cached = ornamentImageCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_DIMENSION;
  canvas.height = CANVAS_DIMENSION;

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  if (data.ornaments?.includes("ap1")) drawAP1(context);

  ornamentImageCache.set(cacheKey, canvas);
  return canvas;
}

function drawAP1(context: CanvasRenderingContext2D): void {
  context.fillStyle = `rgba(255, 146, 53, ${AP1_ORNAMENT_ALPHA})`;
  context.beginPath();
  context.arc(CANVAS_DIMENSION / 2, CANVAS_DIMENSION / 2, AP1_ORNAMENT_SIZE, 0, 2 * Math.PI);
  context.fill();

  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(CANVAS_DIMENSION / 2, CANVAS_DIMENSION / 2, AP1_ORNAMENT_HOLLOW_SIZE, 0, 2 * Math.PI);
  context.fill();
  context.globalCompositeOperation = "source-over";
}

function getOrnamentImageId(data: PortalData): string {
  return `${ORNAMENT_IMAGE_ID_PREFIX}${getOrnamentImageCacheKey(data)}`;
}

function getOrnamentImageCacheKey(data: PortalData): string {
  return (data.ornaments || []).toString();
}
