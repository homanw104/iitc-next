/**
 * Manage scout control halo entities.
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

const DATA_SOURCE_LAYER_NAME = "history-scout-control";
const DATA_SOURCE_LAYER_NAME_REVERSE = "history-scout-control-reverse";
const HALO_POINT_PIXEL_SIZE = PORTAL_POINT_PIXEL_SIZE + PORTAL_POINT_OUTLINE_WIDTH;
const HALO_POINT_OUTLINE_WIDTH = 4;
const HALO_POINT_ALPHA = 0.95;
const SCOUT_CONTROL_COLOR = "#FF9000";

type ScoutHistoryState = "none" | "controlled";

interface ScoutHistoryHalo {
  data: PortalData;
  entity?: Cesium.Entity;
  occlusionEntity?: Cesium.Entity;
  reverseEntity?: Cesium.Entity;
  reverseOcclusionEntity?: Cesium.Entity;
  positionCallback: EntityPositionCallback;
}

export class ScoutHistoryEntityManager {
  private scoutControlHalos: Map<string, ScoutHistoryHalo> = new Map();
  private scoutControlHalosPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {}

  public async addOrUpdateScoutControlHalo(data: PortalData): Promise<void> {
    const existing = this.scoutControlHalos.get(data.guid);
    if (existing) {
      await this.updateScoutControlHaloEntity(existing, data);
      this.updateScoutControlPositionSubscription(existing, data);
      existing.data = data;
    } else {
      if (this.scoutControlHalosPendingCreation.has(data.guid)) return;
      this.scoutControlHalosPendingCreation.add(data.guid);
      try {
        const { entity, occlusionEntity, reverseEntity, reverseOcclusionEntity } = await this.createScoutControlHaloEntity(data);
        const scoutHistoryHalo: ScoutHistoryHalo = {
          data,
          entity,
          occlusionEntity,
          reverseEntity,
          reverseOcclusionEntity,
          positionCallback: (_latE6, _lngE6, position) => {
            if (scoutHistoryHalo.entity) scoutHistoryHalo.entity.position = new Cesium.ConstantPositionProperty(position);
            if (scoutHistoryHalo.occlusionEntity) scoutHistoryHalo.occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
            if (scoutHistoryHalo.reverseEntity) scoutHistoryHalo.reverseEntity.position = new Cesium.ConstantPositionProperty(position);
            if (scoutHistoryHalo.reverseOcclusionEntity) scoutHistoryHalo.reverseOcclusionEntity.position = new Cesium.ConstantPositionProperty(position);
          },
        };
        this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, scoutHistoryHalo.positionCallback);
        this.scoutControlHalos.set(data.guid, scoutHistoryHalo);
      } finally {
        this.scoutControlHalosPendingCreation.delete(data.guid);
      }
    }
  }

  public removeScoutControlHalo(guid: string): void {
    this.removeScoutControlHaloEntity(guid);
  }

  public removeScoutControlHalosInView(viewRect: Cesium.Rectangle): void {
    this.removeScoutControlHaloEntitiesInView(viewRect);
  }

  private async createScoutControlHaloEntity(data: PortalData): Promise<{
    entity: Cesium.Entity | undefined;
    occlusionEntity: Cesium.Entity | undefined;
    reverseEntity: Cesium.Entity | undefined;
    reverseOcclusionEntity: Cesium.Entity | undefined;
  }> {
    const entities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME).entities;
    const reverseEntities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME_REVERSE).entities;
    const scoutHistoryState = getScoutHistoryState(data);
    const position = await this.entityPositionManager.getPosition(data);

    let entity: Cesium.Entity | undefined = undefined;
    let occlusionEntity: Cesium.Entity | undefined = undefined;
    let reverseEntity: Cesium.Entity | undefined = undefined;
    let reverseOcclusionEntity: Cesium.Entity | undefined = undefined;

    if (scoutHistoryState === "controlled") {
      entity = entities.add({
        id: `scout-halo-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(HALO_POINT_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        },
      });
      occlusionEntity = entities.add({
        id: `scout-halo-occluded-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(PORTAL_OCCLUDED_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        },
      });
    } else {
      reverseEntity = reverseEntities.add({
        id: `scout-halo-reverse-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(HALO_POINT_ALPHA),
          outlineWidth: HALO_POINT_OUTLINE_WIDTH,
          scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        },
      });
      reverseOcclusionEntity = reverseEntities.add({
        id: `scout-halo-reverse-occluded-${data.guid}`,
        position: position,
        point: {
          pixelSize: HALO_POINT_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(PORTAL_OCCLUDED_ALPHA),
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

  private async updateScoutControlHaloEntity(scoutHistoryHalo: ScoutHistoryHalo, data: PortalData): Promise<void> {
    this.removeScoutControlHaloEntityGroup(scoutHistoryHalo);
    const { entity, occlusionEntity, reverseEntity, reverseOcclusionEntity } = await this.createScoutControlHaloEntity(data);
    scoutHistoryHalo.entity = entity;
    scoutHistoryHalo.occlusionEntity = occlusionEntity;
    scoutHistoryHalo.reverseEntity = reverseEntity;
    scoutHistoryHalo.reverseOcclusionEntity = reverseOcclusionEntity;
  }

  private updateScoutControlPositionSubscription(scoutControlHaloInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (scoutControlHaloInfo.data.latE6 === data.latE6 && scoutControlHaloInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(scoutControlHaloInfo.data, scoutControlHaloInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, scoutControlHaloInfo.positionCallback);
  }

  private removeScoutControlHaloEntity(guid: string): void {
    const scoutControlHalo = this.scoutControlHalos.get(guid);
    if (scoutControlHalo) {
      this.removeScoutControlHaloEntityGroup(scoutControlHalo);
      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(scoutControlHalo.data, scoutControlHalo.positionCallback);
      this.scoutControlHalos.delete(guid);
    }
    this.scoutControlHalosPendingCreation.delete(guid);
  }

  private removeScoutControlHaloEntityGroup(scoutControlHalo: ScoutHistoryHalo): void {
    const entities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME).entities;
    const reverseEntities = this.layerManager.getOrCreateDataSourceLayer(DATA_SOURCE_LAYER_NAME_REVERSE).entities;

    if (scoutControlHalo.entity) entities.remove(scoutControlHalo.entity);
    if (scoutControlHalo.occlusionEntity) entities.remove(scoutControlHalo.occlusionEntity);
    if (scoutControlHalo.reverseEntity) reverseEntities.remove(scoutControlHalo.reverseEntity);
    if (scoutControlHalo.reverseOcclusionEntity) reverseEntities.remove(scoutControlHalo.reverseOcclusionEntity);

    scoutControlHalo.entity = undefined;
    scoutControlHalo.occlusionEntity = undefined;
    scoutControlHalo.reverseEntity = undefined;
    scoutControlHalo.reverseOcclusionEntity = undefined;
  }

  private removeScoutControlHaloEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.scoutControlHalos.forEach((info, guid) => {
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
    toRemove.forEach(guid => this.removeScoutControlHalo(guid));
  }
}

function getScoutHistoryState(data: PortalData): ScoutHistoryState {
  if (data.history?.scoutControlled) return "controlled";
  return "none";
}
