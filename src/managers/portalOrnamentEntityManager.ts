/**
 * Manage portal ornament entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { LayerManager } from "./layerManager";
import {
  PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  PORTAL_NEAR_FAR_SCALAR,
} from "./portalEntityManager.ts";

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
}

export class PortalOrnamentEntityManager {
  private ornaments: Map<string, PortalOrnament> = new Map();
  private ornamentsPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {}

  public async addOrUpdateOrnament(data: PortalData): Promise<void> {
    if (!data.ornaments?.length) {
      this.removeOrnament(data.guid);
      return;
    }

    const existing = this.ornaments.get(data.guid);
    if (existing) {
      const oldLayerId = getPortalOrnamentLayerId(existing.data);
      const newLayerId = getPortalOrnamentLayerId(data);
      if (oldLayerId !== newLayerId) {
        this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.entity);
        this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.occlusionEntity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.occlusionEntity);
      }
      await this.updateOrnamentEntity(existing.entity, existing.occlusionEntity, data);
      this.updateOrnamentPositionSubscription(existing, data);
      existing.data = data;
      return;
    } else {
      if (this.ornamentsPendingCreation.has(data.guid)) return;
      this.ornamentsPendingCreation.add(data.guid);
      const { entity, occlusionEntity } = await this.createOrnamentEntity(data);
      const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
        entity.position = new Cesium.ConstantPositionProperty(position);
        occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
      };
      this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
      this.ornaments.set(data.guid, { data, entity, occlusionEntity, positionCallback });
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  public removeOrnament(guid: string): void {
    this.removeOrnamentEntity(guid);
  }

  public removeOrnamentsInView(viewRect: Cesium.Rectangle): void {
    this.removeOrnamentEntitiesInView(viewRect);
  }

  private async createOrnamentEntity(data: PortalData): Promise<{
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity
  }> {
    const layerId = getPortalOrnamentLayerId(data);
    const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `ornament-${data.guid}`,
      position: position,
      billboard: {
        image: getOrnamentImage(data),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
      },
    });

    const occlusionEntity = entities.add({
      id: `ornament-${data.guid}-occluded`,
      position: position,
      billboard: {
        image: getOrnamentImage(data),
        color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
        translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
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

  private updateOrnamentPositionSubscription(ornamentInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (ornamentInfo.data.latE6 === data.latE6 && ornamentInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, ornamentInfo.positionCallback);
  }

  private removeOrnamentEntity(guid: string): void {
    const ornamentInfo = this.ornaments.get(guid);
    if (ornamentInfo) {
      const layerId = getPortalOrnamentLayerId(ornamentInfo.data);
      const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;

      entities.remove(ornamentInfo.entity);
      entities.remove(ornamentInfo.occlusionEntity);

      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
      this.ornaments.delete(guid);
    }
    this.ornamentsPendingCreation.delete(guid);
  }

  private removeOrnamentEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.ornaments.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    toRemove.forEach(guid => this.removeOrnamentEntity(guid));
  }
}

function getPortalOrnamentLayerId(data: PortalData): string {
  return `portals-ornament-${data.team.toLowerCase()}`;
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
