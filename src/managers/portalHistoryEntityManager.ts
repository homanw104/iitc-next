/**
 * Manage portal history halo entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import { LayerManager } from "./layerManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  PORTAL_POINT_PIXEL_SIZE,
  PORTAL_POINT_OUTLINE_WIDTH,
  PORTAL_NEAR_FAR_SCALAR,
  getPortalDisableDepthTestDistance,
} from "./portalEntityManager.ts";

const DATA_SOURCE_LAYER_NAME = "history-visited-captured";
const DATA_SOURCE_LAYER_NAME_REVERSE = "history-visited-captured-reverse";
const HALO_POINT_PIXEL_SIZE = PORTAL_POINT_PIXEL_SIZE + PORTAL_POINT_OUTLINE_WIDTH;
const HALO_POINT_OUTLINE_WIDTH = 4;
const HALO_POINT_ALPHA = 0.95;
const VISITED_COLOR = "#FFCE00";
const CAPTURED_COLOR = "#FF6060";

type PortalHistoryState = "none" | "visited" | "captured";

interface PortalHistoryHalo {
  data: PortalData;
  entity?: Cesium.Entity;
  occlusionEntity?: Cesium.Entity;
  reverseEntity?: Cesium.Entity;
  reverseOcclusionEntity?: Cesium.Entity;
  positionCallback: EntityPositionCallback;
}

export class PortalHistoryEntityManager {
  private historyHalos: Map<string, PortalHistoryHalo> = new Map();
  private historyHalosPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {}

  public async addOrUpdateHistoryHalo(data: PortalData): Promise<void> {
    const existing = this.historyHalos.get(data.guid);
    if (existing) {
      await this.updateHistoryHaloEntity(existing, data);
      this.updateHistoryHaloPositionSubscription(existing, data);
      existing.data = data;
    } else {
      if (this.historyHalosPendingCreation.has(data.guid)) return;
      this.historyHalosPendingCreation.add(data.guid);
      try {
        const { entity, occlusionEntity, reverseEntity, reverseOcclusionEntity } = await this.createHistoryHaloEntity(data);
        const portalHistoryHalo: PortalHistoryHalo = {
          data,
          entity,
          occlusionEntity,
          reverseEntity,
          reverseOcclusionEntity,
          positionCallback: (_latE6, _lngE6, position) => {
            if (portalHistoryHalo.entity) portalHistoryHalo.entity.position = new Cesium.ConstantPositionProperty(position);
            if (portalHistoryHalo.occlusionEntity) portalHistoryHalo.occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
            if (portalHistoryHalo.reverseEntity) portalHistoryHalo.reverseEntity.position = new Cesium.ConstantPositionProperty(position);
            if (portalHistoryHalo.reverseOcclusionEntity) portalHistoryHalo.reverseOcclusionEntity.position = new Cesium.ConstantPositionProperty(position);
          },
        };
        this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, portalHistoryHalo.positionCallback);
        this.historyHalos.set(data.guid, portalHistoryHalo);
      } finally {
        this.historyHalosPendingCreation.delete(data.guid);
      }
    }
  }

  public removeHistoryHalo(guid: string): void {
    this.removeHistoryHaloEntity(guid);
  }

  public removeHistoryHalosInView(viewRect: Cesium.Rectangle): void {
    this.removeHistoryHaloEntitiesInView(viewRect);
  }

  private async createHistoryHaloEntity(data: PortalData): Promise<{
    entity: Cesium.Entity | undefined;
    occlusionEntity: Cesium.Entity | undefined;
    reverseEntity: Cesium.Entity | undefined;
    reverseOcclusionEntity: Cesium.Entity | undefined;
  }> {
    const entities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME).entities;
    const reverseEntities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME_REVERSE).entities;
    const portalHistoryState = getPortalHistoryState(data);
    const position = await this.entityPositionManager.getPosition(data);

    let entity: Cesium.Entity | undefined = undefined;
    let occlusionEntity: Cesium.Entity | undefined = undefined;
    let reverseEntity: Cesium.Entity | undefined = undefined;
    let reverseOcclusionEntity: Cesium.Entity | undefined = undefined;

    if (portalHistoryState === "visited" || portalHistoryState === "captured") {
      const color = portalHistoryState === "visited" ? VISITED_COLOR : CAPTURED_COLOR;
      entity = entities.add({
        id: `history-halo-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        },
      });
      occlusionEntity = entities.add({
        id: `history-halo-occluded-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA * PORTAL_OCCLUDED_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        },
      });
    }

    if (portalHistoryState === "visited" || portalHistoryState === "none") {
      const color = portalHistoryState === "visited" ? VISITED_COLOR : CAPTURED_COLOR;
      reverseEntity = reverseEntities.add({
        id: `history-halo-reverse-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        },
      });
      reverseOcclusionEntity = reverseEntities.add({
        id: `history-halo-reverse-occluded-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA * PORTAL_OCCLUDED_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        },
      });
    }

    return { entity, occlusionEntity, reverseEntity, reverseOcclusionEntity };
  }

  private async updateHistoryHaloEntity(portalHistoryHalo: PortalHistoryHalo, data: PortalData): Promise<void> {
    this.removeHistoryHaloEntityGroup(portalHistoryHalo);
    const { entity, occlusionEntity, reverseEntity, reverseOcclusionEntity } = await this.createHistoryHaloEntity(data);
    portalHistoryHalo.entity = entity;
    portalHistoryHalo.occlusionEntity = occlusionEntity;
    portalHistoryHalo.reverseEntity = reverseEntity;
    portalHistoryHalo.reverseOcclusionEntity = reverseOcclusionEntity;
  }

  private updateHistoryHaloPositionSubscription(historyHaloInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (historyHaloInfo.data.latE6 === data.latE6 && historyHaloInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(historyHaloInfo.data, historyHaloInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, historyHaloInfo.positionCallback);
  }

  private removeHistoryHaloEntity(guid: string): void {
    const portalHistoryHalo = this.historyHalos.get(guid);
    if (portalHistoryHalo) {
      this.removeHistoryHaloEntityGroup(portalHistoryHalo);
      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalHistoryHalo.data, portalHistoryHalo.positionCallback);
      this.historyHalos.delete(guid);
    }
    this.historyHalosPendingCreation.delete(guid);
  }

  private removeHistoryHaloEntityGroup(portalHistoryHalo: PortalHistoryHalo): void {
    const entities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME).entities;
    const reverseEntities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME_REVERSE).entities;

    if (portalHistoryHalo.entity) entities.remove(portalHistoryHalo.entity);
    if (portalHistoryHalo.occlusionEntity) entities.remove(portalHistoryHalo.occlusionEntity);
    if (portalHistoryHalo.reverseEntity) reverseEntities.remove(portalHistoryHalo.reverseEntity);
    if (portalHistoryHalo.reverseOcclusionEntity) reverseEntities.remove(portalHistoryHalo.reverseOcclusionEntity);

    portalHistoryHalo.entity = undefined;
    portalHistoryHalo.occlusionEntity = undefined;
    portalHistoryHalo.reverseEntity = undefined;
    portalHistoryHalo.reverseOcclusionEntity = undefined;
  }

  private removeHistoryHaloEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.historyHalos.forEach((info, guid) => {
      const position = info.entity?.position?.getValue(Cesium.JulianDate.now())
        ?? info.occlusionEntity?.position?.getValue(Cesium.JulianDate.now())
        ?? info.reverseEntity?.position?.getValue(Cesium.JulianDate.now())
        ?? info.reverseOcclusionEntity?.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    toRemove.forEach(guid => this.removeHistoryHalo(guid));
  }
}

function getPortalHistoryState(data: PortalData): PortalHistoryState {
  if (data.history?.captured) return "captured";
  if (data.history?.visited) return "visited";
  return "none";
}
