/**
 * Manages entities representing visit and capture history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionManager } from "./entityPositionManager";

interface HistoryHaloInfo {
  data: PortalData;
  entity?: Cesium.Entity;
  reverseEntity?: Cesium.Entity;
}

export class PortalHistoryEntityManager {
  private historyHalos: Map<string, HistoryHaloInfo> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {
    this.entityPositionManager.setOnPositionChangedCallback((latE6, lngE6, position) => {
      this.historyHalos.forEach(({ data, entity, reverseEntity }) => {
        if (data.latE6 === latE6 && data.lngE6 === lngE6) {
          if (entity) entity.position = new Cesium.ConstantPositionProperty(position);
          if (reverseEntity) reverseEntity.position = new Cesium.ConstantPositionProperty(position);
        }
      });
    });
  }

  public addOrUpdateHistoryHalo(data: PortalData): void {
    const existing = this.historyHalos.get(data.guid);
    if (existing) {
      if (data.history?.captured && data.history?.visited) {
        const color = Cesium.Color.fromCssColorString("#FF6060");
        this.removeHistoryHaloEntity(data.guid, true);
        if (existing.entity) this.updateHistoryHaloEntity(existing.entity, data, color);
        else existing.entity = this.createHistoryHaloEntity(data, false, color);
      } else if (data.history?.visited) {
        const color = Cesium.Color.fromCssColorString("#FFCE00");
        if (existing.entity) this.updateHistoryHaloEntity(existing.entity, data, color);
        else existing.entity = this.createHistoryHaloEntity(data, false, color);

        if (existing.reverseEntity) this.updateHistoryHaloEntity(existing.reverseEntity, data, color);
        else existing.reverseEntity = this.createHistoryHaloEntity(data, true, color);
      } else {
        const color = Cesium.Color.fromCssColorString("#FF6060");
        this.removeHistoryHaloEntity(data.guid, false);
        if (existing.reverseEntity) this.updateHistoryHaloEntity(existing.reverseEntity, data, color);
        else existing.reverseEntity = this.createHistoryHaloEntity(data, true, color);
      }
      existing.data = data;
      return;
    }

    const info: HistoryHaloInfo = { data };
    if (data.history?.captured && data.history?.visited) {
      info.entity = this.createHistoryHaloEntity(data, false, Cesium.Color.fromCssColorString("#FF6060"));
    } else if (data.history?.visited) {
      const color = Cesium.Color.fromCssColorString("#FFCE00");
      info.entity = this.createHistoryHaloEntity(data, false, color);
      info.reverseEntity = this.createHistoryHaloEntity(data, true, color);
    } else {
      info.reverseEntity = this.createHistoryHaloEntity(data, true, Cesium.Color.fromCssColorString("#FF6060"));
    }
    this.historyHalos.set(data.guid, info);
  }

  public removeHistoryHalo(guid: string): void {
    this.removeHistoryHaloEntity(guid, false);
    this.removeHistoryHaloEntity(guid, true);
    this.historyHalos.delete(guid);
  }

  public removeHistoryHaloInView(viewRect: Cesium.Rectangle): void {
    this.removeHistoryHaloEntityInView(viewRect);
  }

  private createHistoryHaloEntity(data: PortalData, reverse: boolean, color: Cesium.Color): Cesium.Entity {
    const sourceId = reverse ? "history-visited-captured-reverse" : "history-visited-captured";
    const idSuffix = reverse ? "history-halo-reverse" : "history-halo";
    return this.layerManager.getOrCreateSourceAndFilter(sourceId).entities.add({
      id: `portal-${data.guid}-${idSuffix}`,
      position: this.entityPositionManager.getPosition(data),
      point: {
        pixelSize: 16,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color,
        outlineWidth: 4,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  private updateHistoryHaloEntity(entity: Cesium.Entity, data: PortalData, color: Cesium.Color): void {
    entity.position = new Cesium.ConstantPositionProperty(this.entityPositionManager.getPosition(data));
    if (entity.point) {
      entity.point.outlineColor = new Cesium.ConstantProperty(color);
      entity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.point.disableDepthTestDistance = new Cesium.ConstantProperty(Number.POSITIVE_INFINITY);
    }
  }

  private removeHistoryHaloEntity(guid: string, reverse: boolean): void {
    const info = this.historyHalos.get(guid);
    if (!info) return;

    const entity = reverse ? info.reverseEntity : info.entity;
    if (!entity) return;

    const sourceId = reverse ? "history-visited-captured-reverse" : "history-visited-captured";
    this.layerManager.getOrCreateSourceAndFilter(sourceId).entities.remove(entity);
    if (reverse) info.reverseEntity = undefined;
    else info.entity = undefined;
  }

  private removeHistoryHaloEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.historyHalos.forEach(({ entity, reverseEntity }, guid) => {
      const position = entity?.position?.getValue(Cesium.JulianDate.now())
        ?? reverseEntity?.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) toRemove.push(guid);
      }
    });
    toRemove.forEach(guid => this.removeHistoryHalo(guid));
  }
}
