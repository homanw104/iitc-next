import * as Cesium from "cesium";
import { PortalData } from "../types/ingress.ts";
import { LayerManager } from "./layerManager.ts";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager.ts";
import { PORTAL_DISABLE_DEPTH_TEST_DISTANCE, PORTAL_OCCLUDED_ALPHA } from "./portalEntityManager.ts";

const AP1_ORNAMENT_SIZE = 16;
const AP1_ORNAMENT_HOLLOW_SIZE = 8;
const CANVAS_DIMENSION = AP1_ORNAMENT_SIZE * 2;

const ornamentImageCache = new Map<string, HTMLCanvasElement>();

export class PortalOrnamentEntityManager {
  private ornaments: Map<string, {
    data: PortalData;
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity;
    positionCallback: EntityPositionCallback;
  }> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {}

  public addOrUpdateOrnament(data: PortalData): void {
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
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.occlusionEntity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
      }
      this.updateOrnamentPositionSubscription(existing, data);
      this.updateOrnamentEntity(existing.entity, existing.occlusionEntity, data);
      existing.data = data;
      return;
    }

    const { entity, occlusionEntity } = this.createOrnamentEntities(data);
    const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
      entity.position = new Cesium.ConstantPositionProperty(position);
      occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    };
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
    this.ornaments.set(data.guid, { data, entity, occlusionEntity, positionCallback });
  }

  public removeOrnament(guid: string): void {
    this.removeOrnamentEntity(guid);
  }

  public removeOrnamentInView(viewRect: Cesium.Rectangle): void {
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

  private createOrnamentEntities(data: PortalData): { entity: Cesium.Entity; occlusionEntity: Cesium.Entity } {
    const layerId = getPortalOrnamentLayerId(data);
    const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;
    const position = this.entityPositionManager.getPosition(data);
    const occlusionEntity = entities.add({
      id: `ornament-${data.guid}-occluded`,
      position,
      billboard: {
        image: getOrnamentImage(data),
        color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
      },
    });

    const entity = entities.add({
      id: `ornament-${data.guid}`,
      position,
      billboard: {
        image: getOrnamentImage(data),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
      },
    });
    return { entity, occlusionEntity };
  }

  private updateOrnamentEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): void {
    const position = this.entityPositionManager.getPosition(data);
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.billboard) {
      entity.billboard.image = new Cesium.ConstantProperty(getOrnamentImage(data));
      entity.billboard.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.billboard.disableDepthTestDistance = new Cesium.ConstantProperty(0);
    }
    if (occlusionEntity.billboard) {
      occlusionEntity.billboard.image = new Cesium.ConstantProperty(getOrnamentImage(data));
      occlusionEntity.billboard.color = new Cesium.ConstantProperty(Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA));
      occlusionEntity.billboard.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      occlusionEntity.billboard.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
    }
  }

  private removeOrnamentEntity(guid: string): void {
    const ornamentInfo = this.ornaments.get(guid);
    if (!ornamentInfo) return;

    const layerId = getPortalOrnamentLayerId(ornamentInfo.data);
    this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(ornamentInfo.entity);
    this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(ornamentInfo.occlusionEntity);
    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.ornaments.delete(guid);
  }

  private updateOrnamentPositionSubscription(ornamentInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (ornamentInfo.data.latE6 === data.latE6 && ornamentInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, ornamentInfo.positionCallback);
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
    context.fillStyle = "#ff9135";
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
