/**
 * Manage portal label entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { LayerManager } from "./layerManager";
import {
  PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
} from "./portalEntityManager.ts";

const LABEL_FONT = "12px sans-serif";
const LABEL_PIXEL_OFFSET_Y = -12;
const LABEL_MAX_LINE_LENGTH = 24;

interface PortalLabel {
  data: PortalData;
  entity: Cesium.Entity;
  occlusionEntity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
}

export class PortalLabelEntityManager {
  private labels: Map<string, PortalLabel> = new Map();
  private labelsPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {}

  public async addOrUpdateLabel(data: PortalData): Promise<void> {
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
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
        this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.occlusionEntity);
      }
      await this.updateLabelEntity(existing.entity, existing.occlusionEntity, data);
      this.updateLabelPositionSubscription(existing, data);
      existing.data = data;
      return;
    } else {
      if (this.labelsPendingCreation.has(data.guid)) return;
      this.labelsPendingCreation.add(data.guid);
      const { entity, occlusionEntity } = await this.createLabelEntity(data);
      const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
        entity.position = new Cesium.ConstantPositionProperty(position);
        occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
      };
      this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
      this.labels.set(data.guid, { data, entity, occlusionEntity, positionCallback });
      this.labelsPendingCreation.delete(data.guid);
    }
  }

  public removeLabel(guid: string): void {
    this.removeLabelEntity(guid);
  }

  public removeLabelsInView(viewRect: Cesium.Rectangle): void {
    this.removeLabelEntitiesInView(viewRect);
  }

  private async createLabelEntity(data: PortalData): Promise<{
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity
  }> {
    const layerId = getPortalLabelLayerId(data);
    const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `label-${data.guid}`,
      position: position,
      label: {
        text: wrapLabelText(data.title || ""),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 8,
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

    const occlusionEntity = entities.add({
      id: `label-occluded-${data.guid}`,
      position: position,
      label: {
        text: wrapLabelText(data.title || ""),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineWidth: 8,
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
    return { entity, occlusionEntity };
  }

  private async updateLabelEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);

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

  private removeLabelEntity(guid: string): void {
    const labelInfo = this.labels.get(guid);
    if (labelInfo) {
      const layerId = getPortalLabelLayerId(labelInfo.data);
      const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;

      entities.remove(labelInfo.entity);
      entities.remove(labelInfo.occlusionEntity);

      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(labelInfo.data, labelInfo.positionCallback);
      this.labels.delete(guid);
    }
    this.labelsPendingCreation.delete(guid);
  }

  private removeLabelEntitiesInView(viewRect: Cesium.Rectangle): void {
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
