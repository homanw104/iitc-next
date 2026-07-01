/**
 * Manage portal ornament entities.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/ingress";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  createPortalNearFarScalar,
  getPortalDisableDepthTestDistance,
} from "./portalEntityManager.ts";
import { getPortalOrnamentEntityLayerId } from "./portalEntityLayers";

const AP1_ORNAMENT_SIZE = 16;
const AP1_ORNAMENT_HOLLOW_SIZE = 8;
const AP1_ORNAMENT_ALPHA = 0.95;
const CANVAS_DIMENSION = AP1_ORNAMENT_SIZE * 2;

const ornamentImageCache = new Map<string, HTMLCanvasElement>();

interface PortalOrnament {
  data: PortalData;
  entity: Cesium.Entity;
  occlusionEntity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
  currentLayerId: string;
}

export class PortalOrnamentEntityManager {
  private ornaments: Map<string, PortalOrnament> = new Map();
  private ornamentsPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    private entityTranslucencyManager: EntityTranslucencyManager
  ) {}

  public async addOrUpdateOrnament(data: PortalData): Promise<void> {
    if (!data.ornaments?.length) {
      this.removeOrnament(data.guid);
      return;
    }

    const existing = this.ornaments.get(data.guid);
    if (existing) {
      await this.updateExistingOrnament(existing, data);
    } else {
      await this.createAndStoreOrnament(data);
    }
  }

  public async addOrUpdateOrnaments(portals: PortalData[]): Promise<void> {
    const layers = new Set<string>();
    portals.forEach((portal) => {
      const existing = this.ornaments.get(portal.guid);
      if (existing) layers.add(existing.currentLayerId);
      if (portal.ornaments?.length) layers.add(getPortalOrnamentEntityLayerId(portal));
    });

    await this.layerManager.withEntityCollectionEventsSuspended(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      async () => {
        await Promise.all(portals.map((portal) => this.addOrUpdateOrnament(portal)));
      }
    );
  }

  public removeOrnament(guid: string): void {
    this.removeOrnamentEntity(guid);
  }

  public removeOrnamentsInView(viewRect: Cesium.Rectangle): void {
    this.removeOrnamentEntitiesInView(viewRect);
  }

  private async updateExistingOrnament(ornament: PortalOrnament, data: PortalData): Promise<void> {
    this.moveOrnamentToLayer(ornament, getPortalOrnamentEntityLayerId(data));
    await this.updateOrnamentEntity(ornament.entity, ornament.occlusionEntity, data);
    this.updateOrnamentPositionSubscription(ornament, data);
    ornament.data = data;
  }

  private async createAndStoreOrnament(data: PortalData): Promise<void> {
    if (this.ornamentsPendingCreation.has(data.guid)) return;

    this.ornamentsPendingCreation.add(data.guid);
    try {
      const { entity, occlusionEntity } = await this.createOrnamentEntity(data);
      const positionCallback = createOrnamentPositionCallback(entity, occlusionEntity);
      this.entityPositionManager.setOnPositionChangedCallback(data, positionCallback);
      this.ornaments.set(data.guid, {
        data,
        entity,
        occlusionEntity,
        positionCallback,
        currentLayerId: getPortalOrnamentEntityLayerId(data),
      });
    } finally {
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  private async createOrnamentEntity(data: PortalData): Promise<{
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity
  }> {
    const layerId = getPortalOrnamentEntityLayerId(data);
    const entities = this.layerManager.getOrCreateDataSource(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `ornament-${data.guid}`,
      position: position,
      billboard: {
        image: getOrnamentImage(data),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: createPortalNearFarScalar(),
      },
    });

    const occlusionEntity = entities.add({
      id: `ornament-occluded-${data.guid}`,
      position: position,
      billboard: {
        image: getOrnamentImage(data),
        color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: createPortalNearFarScalar(),
        translucencyByDistance: this.entityTranslucencyManager.getCallbackProperty(),
      },
    });
    return { entity, occlusionEntity };
  }

  private async updateOrnamentEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);

    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.billboard) {
      entity.billboard.image = new Cesium.ConstantProperty(getOrnamentImage(data));
    }
    if (occlusionEntity.billboard) {
      occlusionEntity.billboard.image = new Cesium.ConstantProperty(getOrnamentImage(data));
    }
  }

  private updateOrnamentPositionSubscription(ornament: PortalOrnament, data: PortalData): void {
    if (ornament.data.latE6 === data.latE6 && ornament.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnPositionChangedCallback(ornament.data, ornament.positionCallback);
    this.entityPositionManager.setOnPositionChangedCallback(data, ornament.positionCallback);
  }

  private removeOrnamentEntity(guid: string): void {
    const ornamentInfo = this.ornaments.get(guid);
    if (ornamentInfo) {
      const entities = this.layerManager.getOrCreateDataSource(ornamentInfo.currentLayerId).entities;

      entities.remove(ornamentInfo.entity);
      entities.remove(ornamentInfo.occlusionEntity);

      this.entityPositionManager.unsetOnPositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
      this.ornaments.delete(guid);
    }
    this.ornamentsPendingCreation.delete(guid);
  }

  private removeOrnamentEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    this.ornaments.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
          layers.add(info.currentLayerId);
        }
      }
    });
    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      () => toRemove.forEach(guid => this.removeOrnamentEntity(guid))
    );
  }

  private moveOrnamentToLayer(ornamentInfo: PortalOrnament, newLayerId: string): void {
    if (ornamentInfo.currentLayerId === newLayerId) return;

    this.layerManager.getOrCreateDataSource(ornamentInfo.currentLayerId).entities.remove(ornamentInfo.entity);
    this.layerManager.getOrCreateDataSource(ornamentInfo.currentLayerId).entities.remove(ornamentInfo.occlusionEntity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(ornamentInfo.entity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(ornamentInfo.occlusionEntity);
    ornamentInfo.currentLayerId = newLayerId;
  }
}

function createOrnamentPositionCallback(
  entity: Cesium.Entity,
  occlusionEntity: Cesium.Entity,
): EntityPositionCallback {
  return (_latE6, _lngE6, position) => {
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
  };
}

function getOrnamentImage(data: PortalData): HTMLCanvasElement {
  const cacheKey = (data.ornaments || []).toString();
  const cached = ornamentImageCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_DIMENSION;
  canvas.height = CANVAS_DIMENSION;

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  if (data.ornaments?.includes("ap1")) {
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

  ornamentImageCache.set(cacheKey, canvas);
  return canvas;
}
