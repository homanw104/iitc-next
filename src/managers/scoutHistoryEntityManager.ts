/**
 * Manages entities representing scout control history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { EntityPositionManager } from "./entityPositionManager";
import { PORTAL_DISABLE_DEPTH_TEST_DISTANCE } from "./portalEntityManager.ts";

interface ScoutControlHaloInfo {
  data: PortalData;
  entity?: Cesium.Entity;
  reverseEntity?: Cesium.Entity;
}

export class ScoutHistoryEntityManager {
  private scoutControlHalos: Map<string, ScoutControlHaloInfo> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {
    this.entityPositionManager.setOnPositionChangedCallback((latE6, lngE6, position) => {
      this.scoutControlHalos.forEach(({ data, entity, reverseEntity }) => {
        if (data.latE6 === latE6 && data.lngE6 === lngE6) {
          if (entity) entity.position = new Cesium.ConstantPositionProperty(position);
          if (reverseEntity) reverseEntity.position = new Cesium.ConstantPositionProperty(position);
        }
      });
    });
  }

  public addOrUpdateScoutControlHalo(data: PortalData): void {
    const existing = this.scoutControlHalos.get(data.guid);
    if (existing) {
      const color = Cesium.Color.fromCssColorString("#FF9000");
      if (data.history?.scoutControlled) {
        this.removeScoutControlHaloEntity(data.guid, true);
        if (existing.entity) this.updateScoutControlHaloEntity(existing.entity, data, color);
        else existing.entity = this.createScoutControlHaloEntity(data, false, color);
      } else {
        this.removeScoutControlHaloEntity(data.guid, false);
        if (existing.reverseEntity) this.updateScoutControlHaloEntity(existing.reverseEntity, data, color);
        else existing.reverseEntity = this.createScoutControlHaloEntity(data, true, color);
      }
      existing.data = data;
      return;
    }

    const color = Cesium.Color.fromCssColorString("#FF9000");
    const info: ScoutControlHaloInfo = { data };
    if (data.history?.scoutControlled) {
      info.entity = this.createScoutControlHaloEntity(data, false, color);
    } else {
      info.reverseEntity = this.createScoutControlHaloEntity(data, true, color);
    }
    this.scoutControlHalos.set(data.guid, info);
  }

  public removeScoutControlHalo(guid: string): void {
    this.removeScoutControlHaloEntity(guid, false);
    this.removeScoutControlHaloEntity(guid, true);
    this.scoutControlHalos.delete(guid);
  }

  public removeScoutControlHaloInView(viewRect: Cesium.Rectangle): void {
    this.removeScoutControlHaloEntityInView(viewRect);
  }

  private createScoutControlHaloEntity(data: PortalData, reverse: boolean, color: Cesium.Color): Cesium.Entity {
    const sourceId = reverse ? "history-scout-control-reverse" : "history-scout-control";
    const idSuffix = reverse ? "scout-halo-reverse" : "scout-halo";
    return this.layerManager.getOrCreateDataSourceLayer(sourceId).entities.add({
      id: `portal-${data.guid}-${idSuffix}`,
      position: this.entityPositionManager.getPosition(data),
      point: {
        pixelSize: 16,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color,
        outlineWidth: 4,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
      },
    });
  }

  private updateScoutControlHaloEntity(entity: Cesium.Entity, data: PortalData, color: Cesium.Color): void {
    entity.position = new Cesium.ConstantPositionProperty(this.entityPositionManager.getPosition(data));
    if (entity.point) {
      entity.point.outlineColor = new Cesium.ConstantProperty(color);
      entity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.point.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
    }
  }

  private removeScoutControlHaloEntity(guid: string, reverse: boolean): void {
    const info = this.scoutControlHalos.get(guid);
    if (!info) return;

    const entity = reverse ? info.reverseEntity : info.entity;
    if (!entity) return;

    const sourceId = reverse ? "history-scout-control-reverse" : "history-scout-control";
    this.layerManager.getOrCreateDataSourceLayer(sourceId).entities.remove(entity);
    if (reverse) info.reverseEntity = undefined;
    else info.entity = undefined;
  }

  private removeScoutControlHaloEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.scoutControlHalos.forEach(({ entity, reverseEntity }, guid) => {
      const position = entity?.position?.getValue(Cesium.JulianDate.now())
        ?? reverseEntity?.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) toRemove.push(guid);
      }
    });
    toRemove.forEach(guid => this.removeScoutControlHalo(guid));
  }
}
