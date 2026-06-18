/**
 * Manages entities representing visit and capture history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { PORTAL_DISABLE_DEPTH_TEST_DISTANCE, PORTAL_OCCLUDED_ALPHA } from "./portalEntityManager.ts";

interface HistoryHaloInfo {
  data: PortalData;
  positionCallback: EntityPositionCallback;
  entity?: Cesium.Entity;
  occlusionEntity?: Cesium.Entity;
  reverseEntity?: Cesium.Entity;
  reverseOcclusionEntity?: Cesium.Entity;
}

export class PortalHistoryEntityManager {
  private historyHalos: Map<string, HistoryHaloInfo> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {}

  public addOrUpdateHistoryHalo(data: PortalData): void {
    const existing = this.historyHalos.get(data.guid);
    if (existing) {
      this.updateHistoryHaloPositionSubscription(existing, data);
      if (data.history?.captured && data.history?.visited) {
        const color = Cesium.Color.fromCssColorString("#FF6060");
        this.removeHistoryHaloEntity(data.guid, true);
        if (existing.entity && existing.occlusionEntity) {
          this.updateHistoryHaloEntity(existing.entity, existing.occlusionEntity, data, color);
        } else {
          const entities = this.createHistoryHaloEntities(data, false, color);
          existing.entity = entities.entity;
          existing.occlusionEntity = entities.occlusionEntity;
        }
      } else if (data.history?.visited) {
        const color = Cesium.Color.fromCssColorString("#FFCE00");
        if (existing.entity && existing.occlusionEntity) {
          this.updateHistoryHaloEntity(existing.entity, existing.occlusionEntity, data, color);
        } else {
          const entities = this.createHistoryHaloEntities(data, false, color);
          existing.entity = entities.entity;
          existing.occlusionEntity = entities.occlusionEntity;
        }

        if (existing.reverseEntity && existing.reverseOcclusionEntity) {
          this.updateHistoryHaloEntity(existing.reverseEntity, existing.reverseOcclusionEntity, data, color);
        } else {
          const entities = this.createHistoryHaloEntities(data, true, color);
          existing.reverseEntity = entities.entity;
          existing.reverseOcclusionEntity = entities.occlusionEntity;
        }
      } else {
        const color = Cesium.Color.fromCssColorString("#FF6060");
        this.removeHistoryHaloEntity(data.guid, false);
        if (existing.reverseEntity && existing.reverseOcclusionEntity) {
          this.updateHistoryHaloEntity(existing.reverseEntity, existing.reverseOcclusionEntity, data, color);
        } else {
          const entities = this.createHistoryHaloEntities(data, true, color);
          existing.reverseEntity = entities.entity;
          existing.reverseOcclusionEntity = entities.occlusionEntity;
        }
      }
      existing.data = data;
      return;
    }

    const info: HistoryHaloInfo = {
      data,
      positionCallback: (_latE6, _lngE6, position) => {
        if (info.entity) info.entity.position = new Cesium.ConstantPositionProperty(position);
        if (info.occlusionEntity) info.occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
        if (info.reverseEntity) info.reverseEntity.position = new Cesium.ConstantPositionProperty(position);
        if (info.reverseOcclusionEntity) info.reverseOcclusionEntity.position = new Cesium.ConstantPositionProperty(position);
      },
    };
    if (data.history?.captured && data.history?.visited) {
      const entities = this.createHistoryHaloEntities(data, false, Cesium.Color.fromCssColorString("#FF6060"));
      info.entity = entities.entity;
      info.occlusionEntity = entities.occlusionEntity;
    } else if (data.history?.visited) {
      const color = Cesium.Color.fromCssColorString("#FFCE00");
      const entities = this.createHistoryHaloEntities(data, false, color);
      const reverseEntities = this.createHistoryHaloEntities(data, true, color);
      info.entity = entities.entity;
      info.occlusionEntity = entities.occlusionEntity;
      info.reverseEntity = reverseEntities.entity;
      info.reverseOcclusionEntity = reverseEntities.occlusionEntity;
    } else {
      const reverseEntities = this.createHistoryHaloEntities(data, true, Cesium.Color.fromCssColorString("#FF6060"));
      info.reverseEntity = reverseEntities.entity;
      info.reverseOcclusionEntity = reverseEntities.occlusionEntity;
    }
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, info.positionCallback);
    this.historyHalos.set(data.guid, info);
  }

  public removeHistoryHalo(guid: string): void {
    const info = this.historyHalos.get(guid);
    this.removeHistoryHaloEntity(guid, false);
    this.removeHistoryHaloEntity(guid, true);
    if (info) this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(info.data, info.positionCallback);
    this.historyHalos.delete(guid);
  }

  public removeHistoryHaloInView(viewRect: Cesium.Rectangle): void {
    this.removeHistoryHaloEntityInView(viewRect);
  }

  private createHistoryHaloEntities(data: PortalData, reverse: boolean, color: Cesium.Color): { entity: Cesium.Entity; occlusionEntity: Cesium.Entity } {
    const sourceId = reverse ? "history-visited-captured-reverse" : "history-visited-captured";
    const idSuffix = reverse ? "history-halo-reverse" : "history-halo";
    const entities = this.layerManager.getOrCreateDataSourceLayer(sourceId).entities;
    const position = this.entityPositionManager.getPosition(data);
    const occlusionEntity = entities.add({
      id: `portal-${data.guid}-${idSuffix}-occluded`,
      position,
      point: {
        pixelSize: 16,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineWidth: 4,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        translucencyByDistance: new Cesium.NearFarScalar(1e1, 1, 2e4, 0.125),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
      },
    });

    const entity = entities.add({
      id: `portal-${data.guid}-${idSuffix}`,
      position,
      point: {
        pixelSize: 16,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color,
        outlineWidth: 4,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
      },
    });
    return { entity, occlusionEntity };
  }

  private updateHistoryHaloEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData, color: Cesium.Color): void {
    const position = this.entityPositionManager.getPosition(data);
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
    if (entity.point) {
      entity.point.outlineColor = new Cesium.ConstantProperty(color);
      entity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.point.disableDepthTestDistance = new Cesium.ConstantProperty(0);
    }
    if (occlusionEntity.point) {
      occlusionEntity.point.outlineColor = new Cesium.ConstantProperty(color.withAlpha(PORTAL_OCCLUDED_ALPHA));
      occlusionEntity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      occlusionEntity.point.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
    }
  }

  private removeHistoryHaloEntity(guid: string, reverse: boolean): void {
    const info = this.historyHalos.get(guid);
    if (!info) return;

    const entity = reverse ? info.reverseEntity : info.entity;
    const occlusionEntity = reverse ? info.reverseOcclusionEntity : info.occlusionEntity;
    if (!entity && !occlusionEntity) return;

    const sourceId = reverse ? "history-visited-captured-reverse" : "history-visited-captured";
    const entities = this.layerManager.getOrCreateDataSourceLayer(sourceId).entities;
    if (entity) entities.remove(entity);
    if (occlusionEntity) entities.remove(occlusionEntity);
    if (reverse) {
      info.reverseEntity = undefined;
      info.reverseOcclusionEntity = undefined;
    } else {
      info.entity = undefined;
      info.occlusionEntity = undefined;
    }
  }

  private removeHistoryHaloEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.historyHalos.forEach(({ entity, occlusionEntity, reverseEntity, reverseOcclusionEntity }, guid) => {
      const position = entity?.position?.getValue(Cesium.JulianDate.now())
        ?? occlusionEntity?.position?.getValue(Cesium.JulianDate.now())
        ?? reverseEntity?.position?.getValue(Cesium.JulianDate.now())
        ?? reverseOcclusionEntity?.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) toRemove.push(guid);
      }
    });
    toRemove.forEach(guid => this.removeHistoryHalo(guid));
  }

  private updateHistoryHaloPositionSubscription(info: HistoryHaloInfo, data: PortalData): void {
    if (info.data.latE6 === data.latE6 && info.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(info.data, info.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, info.positionCallback);
  }
}
