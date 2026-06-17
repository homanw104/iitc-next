/**
 * Manage Cesium label-backed portal label entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionManager } from "./entityPositionManager";
import { PORTAL_DISABLE_DEPTH_TEST_DISTANCE } from "./portalEntityManager.ts";

const LABEL_FONT = "12px sans-serif";
const LABEL_PIXEL_OFFSET_Y = -12;
const LABEL_MAX_LINE_LENGTH = 24;
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
      label: {
        text: wrapLabelText(data.title || ""),
        font: LABEL_FONT,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
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
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(wrapLabelText(data.title || ""));
      entity.label.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.label.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
    }
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
