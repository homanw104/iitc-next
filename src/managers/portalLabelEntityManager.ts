/**
 * Manage billboard-backed portal label entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionManager } from "./entityPositionManager";

const LABEL_FONT = "12px sans-serif";
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 3;
const LABEL_PIXEL_OFFSET_Y = -20;
const LABEL_MAX_WIDTH = 240;

const labelImageCache = new Map<string, HTMLCanvasElement>();

export class PortalLabelEntityManager {
  private labels: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {
    this.entityPositionManager.setOnPositionChangedCallback((latE6, lngE6, position) => {
      this.labels.forEach(({ data, entity }) => {
        if (data.latE6 === latE6 && data.lngE6 === lngE6) {
          entity.position = new Cesium.ConstantPositionProperty(position);
        }
      });
    });
  }

  public addOrUpdateLabel(data: PortalData): void {
    if (!data.title) {
      this.removeLabel(data.guid);
      return;
    }

    const existing = this.labels.get(data.guid);
    if (existing) {
      const oldLayerId = getPortalLabelLayerId(existing.data);
      const newLayerId = getPortalLabelLayerId(data);
      if (oldLayerId !== newLayerId) {
        this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.entity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
      }
      this.updateLabelEntity(existing.entity, data);
      existing.data = data;
      return;
    }

    const entity = this.createLabelEntity(data);
    this.labels.set(data.guid, { data, entity });
  }

  public removeLabel(guid: string): void {
    this.removeLabelEntity(guid);
  }

  public removeLabelInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.labels.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    toRemove.forEach(guid => this.removeLabelEntity(guid));
  }

  private createLabelEntity(data: PortalData): Cesium.Entity {
    const layerId = getPortalLabelLayerId(data);
    return this.layerManager.getOrCreateDataSourceLayer(layerId).entities.add({
      id: `label-${data.guid}`,
      position: this.entityPositionManager.getPosition(data),
      billboard: {
        image: getPortalLabelImage(data),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, LABEL_PIXEL_OFFSET_Y),
        translucencyByDistance: new Cesium.NearFarScalar(6e2, 1.0, 8e2, 0.0),
      },
      properties: {
        selectable: false,
      },
    });
  }

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (!labelInfo) return;

    const layerId = getPortalLabelLayerId(labelInfo.data);
    this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(labelInfo.entity);
    this.labels.delete(guid);
  }

  private updateLabelEntity(entity: Cesium.Entity, data: PortalData): void {
    entity.position = new Cesium.ConstantPositionProperty(this.entityPositionManager.getPosition(data));
    if (entity.billboard) {
      entity.billboard.image = new Cesium.ConstantProperty(getPortalLabelImage(data));
      entity.billboard.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.billboard.disableDepthTestDistance = new Cesium.ConstantProperty(Number.POSITIVE_INFINITY);
    }
  }
}

function getPortalLabelLayerId(data: PortalData): string {
  return `portals-label-${data.team.toLowerCase()}`;
}

function getPortalLabelImage(data: PortalData): HTMLCanvasElement {
  const text = data.title || "";
  const cacheKey = text;
  const cached = labelImageCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.font = LABEL_FONT;
  const textWidth = Math.min(Math.ceil(context.measureText(text).width), LABEL_MAX_WIDTH);
  canvas.width = textWidth + LABEL_PADDING_X * 2;
  canvas.height = 18 + LABEL_PADDING_Y * 2;

  context.font = LABEL_FONT;
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.lineJoin = "round";
  context.strokeStyle = "black";
  context.lineWidth = 4;
  context.fillStyle = "white";

  const x = canvas.width / 2;
  const y = canvas.height / 2;
  context.strokeText(text, x, y, textWidth);
  context.fillText(text, x, y, textWidth);

  labelImageCache.set(cacheKey, canvas);
  return canvas;
}
