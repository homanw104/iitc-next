/**
 * Manage Cesium label-backed portal label entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { PORTAL_DISABLE_DEPTH_TEST_DISTANCE, PORTAL_OCCLUDED_ALPHA } from "./portalEntityManager.ts";

const LABEL_FONT = "12px sans-serif";
const LABEL_PIXEL_OFFSET_Y = -12;
const LABEL_MAX_LINE_LENGTH = 24;
export class PortalLabelEntityManager {
  private labels: Map<string, {
    data: PortalData;
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity;
    positionCallback: EntityPositionCallback;
  }> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {}

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
        this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.occlusionEntity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.occlusionEntity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
      }
      this.updateLabelPositionSubscription(existing, data);
      this.updateLabelEntity(existing.entity, existing.occlusionEntity, data);
      existing.data = data;
      return;
    }

    const { entity, occlusionEntity } = this.createLabelEntities(data);
    const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
      entity.position = new Cesium.ConstantPositionProperty(position);
      occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    };
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
    this.labels.set(data.guid, { data, entity, occlusionEntity, positionCallback });
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

  private createLabelEntities(data: PortalData): { entity: Cesium.Entity; occlusionEntity: Cesium.Entity } {
    const layerId = getPortalLabelLayerId(data);
    const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;
    const position = this.entityPositionManager.getPosition(data);
    const occlusionEntity = entities.add({
      id: `label-${data.guid}-occluded`,
      position,
      label: {
        text: wrapLabelText(data.title || ""),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineWidth: 4,
        showBackground: false,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, LABEL_PIXEL_OFFSET_Y),
        translucencyByDistance: new Cesium.NearFarScalar(6e2, 1.0, 8e2, 0.0),
      },
      properties: {
        selectable: false,
      },
    });

    const entity = entities.add({
      id: `label-${data.guid}`,
      position,
      label: {
        text: wrapLabelText(data.title || ""),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        showBackground: false,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, LABEL_PIXEL_OFFSET_Y),
        translucencyByDistance: new Cesium.NearFarScalar(6e2, 1.0, 8e2, 0.0),
      },
      properties: {
        selectable: false,
      },
    });
    return { entity, occlusionEntity };
  }

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (!labelInfo) return;

    const layerId = getPortalLabelLayerId(labelInfo.data);
    this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(labelInfo.entity);
    this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(labelInfo.occlusionEntity);
    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
    this.labels.delete(guid);
  }

  private updateLabelEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): void {
    const position = this.entityPositionManager.getPosition(data);
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(wrapLabelText(data.title || ""));
      entity.label.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.label.disableDepthTestDistance = new Cesium.ConstantProperty(0);
    }
    if (occlusionEntity.label) {
      occlusionEntity.label.text = new Cesium.ConstantProperty(wrapLabelText(data.title || ""));
      occlusionEntity.label.fillColor = new Cesium.ConstantProperty(Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA));
      occlusionEntity.label.outlineColor = new Cesium.ConstantProperty(Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA));
      occlusionEntity.label.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      occlusionEntity.label.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
    }
  }

  private updateLabelPositionSubscription(labelInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (labelInfo.data.latE6 === data.latE6 && labelInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, labelInfo.positionCallback);
  }
}

function getPortalLabelLayerId(data: PortalData): string {
  return `portals-label-${data.team.toLowerCase()}`;
}

function wrapLabelText(text: string): string {
  const trimmedText = text.trim();
  if (trimmedText.length <= LABEL_MAX_LINE_LENGTH) return trimmedText;

  const words = trimmedText.split(/\s+/);
  if (words.length === 1) return chunkText(trimmedText).join("\n");

  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= LABEL_MAX_LINE_LENGTH) {
      line = candidate;
      return;
    }

    if (line) lines.push(line);
    if (word.length <= LABEL_MAX_LINE_LENGTH) {
      line = word;
      return;
    }

    const chunks = chunkText(word);
    lines.push(...chunks.slice(0, -1));
    line = chunks[chunks.length - 1] || "";
  });

  if (line) lines.push(line);
  return lines.join("\n");
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += LABEL_MAX_LINE_LENGTH) {
    chunks.push(text.slice(index, index + LABEL_MAX_LINE_LENGTH));
  }
  return chunks;
}
