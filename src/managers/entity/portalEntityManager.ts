/**
 * Manage portal entities.
 */

import * as Cesium from "cesium";
import { PortalData } from "../../types/ingress";
import { EntityPositionManager, EntityPositionCallback } from "./entityPositionManager";
import { LayerManager } from "../layer/layerManager";
import { getTeamColor } from "../../utils/color";
import { intelApiClient } from "../../api/intelApiClient";
import { settingsManager } from "../system/settingsManager.ts";
import { EntityTranslucencyManager } from "./entityTranslucencyManager";
import { parsePortal } from "../tiles/tileRequestEntityParser";

export const PORTAL_POINT_PIXEL_SIZE = 16;
export const PORTAL_POINT_OUTLINE_WIDTH = 2;
export const PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE = 2e4;
export const PORTAL_OCCLUDED_ALPHA = 0.5;
export const PORTAL_NEAR_FAR_SCALAR = new Cesium.NearFarScalar(1e1, 1, 2e4, 0.125);

const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_DEFAULT = 2e4;
const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_GOOGLE = 0;

interface Portal {
  data: PortalData;
  entity: Cesium.Entity;
  occlusionEntity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
}

export class PortalEntityManager {
  private portals: Map<string, Portal> = new Map();
  private portalsPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    private entityTranslucencyManager: EntityTranslucencyManager
  ) {}

  public async requestPortalDetails(guid: string): Promise<void> {
    const data = await intelApiClient.getPortalDetails(guid);
    const portalData = parsePortal([guid, data.result[13] as number, data.result]);
    await this.addOrUpdatePortal(portalData);
  }

  public hasPortal(guid: string): boolean {
    return this.portals.has(guid) || this.portalsPendingCreation.has(guid);
  }

  public async addOrUpdatePortals(portals: PortalData[]): Promise<void> {
    const layers = new Set<string>();
    portals.forEach((portal) => {
      const existing = this.portals.get(portal.guid);
      if (existing) layers.add(getPortalLayerId(existing.data));
      layers.add(getPortalLayerId(portal));
    });

    await this.layerManager.withEntityCollectionEventsSuspended(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      async () => {
        await Promise.all(portals.map((portal) => this.addOrUpdatePortal(portal)));
      }
    );
  }

  public async addOrUpdatePortal(data: PortalData): Promise<void> {
    const existing = this.portals.get(data.guid);
    if (existing) {
      if (data.isPlaceholder) return;
      if (
        existing.data.isPlaceholder ||
        data.timestamp > existing.data.timestamp ||
        data.resonators
      ) {
        const oldLayerId = getPortalLayerId(existing.data);
        const newLayerId = getPortalLayerId(data);
        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateDataSource(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateDataSource(oldLayerId).entities.remove(existing.occlusionEntity);
          this.layerManager.getOrCreateDataSource(newLayerId).entities.add(existing.entity);
          this.layerManager.getOrCreateDataSource(newLayerId).entities.add(existing.occlusionEntity);
        }
        await this.updatePortalEntity(existing.entity, existing.occlusionEntity, data);
        this.updatePortalPositionSubscription(existing, data);
        existing.data = data;
      }
    } else {
      if (this.portalsPendingCreation.has(data.guid)) return;
      this.portalsPendingCreation.add(data.guid);
      try {
        const { entity, occlusionEntity } = await this.createPortalEntity(data);
        const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
          entity.position = new Cesium.ConstantPositionProperty(position);
          occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
        };
        this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
        this.portals.set(data.guid, { data, entity, occlusionEntity, positionCallback });
      } finally {
        this.portalsPendingCreation.delete(data.guid);
      }
    }
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portals.get(guid)?.data;
  }

  public getPortalDataByCoordinates(latE6: number, lngE6: number): PortalData | undefined {
    return Array.from(this.portals.values()).find(({ data }) =>
      data.latE6 === latE6 && data.lngE6 === lngE6
    )?.data;
  }

  public getPortalEntity(guid: string): Cesium.Entity | undefined {
    return this.portals.get(guid)?.entity;
  }

  public removePortal(guid: string): void {
    this.removePortalEntity(guid);
  }

  public removePortalsInView(viewRect: Cesium.Rectangle): void {
    this.removePortalEntitiesInView(viewRect);
  }

  private async createPortalEntity(data: PortalData): Promise<{
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity
  }> {
    const layerId = getPortalLayerId(data);
    const entities = this.layerManager.getOrCreateDataSource(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `portal-${data.guid}`,
      position: position,
      point: {
        pixelSize: PORTAL_POINT_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
        color: getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
      },
      properties: {
        selectable: true,
      },
    });

    const occlusionEntity = entities.add({
      id: `portal-${data.guid}-occluded`,
      position: position,
      point: {
        pixelSize: PORTAL_POINT_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
        translucencyByDistance: this.entityTranslucencyManager.getOccludedTranslucencyByDistance(),
        color: getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
      },
      properties: {
        selectable: false,
      },
    });

    return { entity, occlusionEntity };
  }

  private async updatePortalEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);

    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team));
    }
    if (occlusionEntity.point) {
      occlusionEntity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA));
    }
  }

  private updatePortalPositionSubscription(portalInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (portalInfo.data.latE6 === data.latE6 && portalInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalInfo.data, portalInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, portalInfo.positionCallback);
  }

  private removePortalEntity(guid: string): void {
    const portalInfo = this.portals.get(guid);
    if (portalInfo) {
      const layerId = getPortalLayerId(portalInfo.data);
      const entities = this.layerManager.getOrCreateDataSource(layerId).entities;

      entities.remove(portalInfo.entity);
      entities.remove(portalInfo.occlusionEntity);

      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalInfo.data, portalInfo.positionCallback);
      this.portals.delete(guid);
    }
    this.portalsPendingCreation.delete(guid);
  }

  private removePortalEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    this.portals.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
          layers.add(getPortalLayerId(info.data));
        }
      }
    });
    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      () => toRemove.forEach(guid => this.removePortalEntity(guid))
    );
  }
}

function getPortalLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (data.isPlaceholder || level === 0) {
    return `portals-placeholder-${team}`;
  }
  return `portals-l${level}-${team}`;
}

export function getPortalDisableDepthTestDistance(): number {
  return settingsManager.getUseGoogle3dTiles() ?
    PORTAL_DISABLE_DEPTH_TEST_DISTANCE_GOOGLE :
    PORTAL_DISABLE_DEPTH_TEST_DISTANCE_DEFAULT;
}
