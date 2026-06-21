/**
 * Manage portal entities.
 */

import * as Cesium from "cesium";
import { PortalData, PortalLevel, PortalMod, PortalResonator, RawEntity } from "../types/ingress";
import { EntityPositionManager, EntityPositionCallback } from "./entityPositionManager";
import { LayerManager } from "./layerManager";
import { getTeamColor } from "../utils/color";
import { apiRequest } from "../utils/network";

export const PORTAL_POINT_PIXEL_SIZE = 16;
export const PORTAL_POINT_OUTLINE_WIDTH = 2;
export const PORTAL_DISABLE_DEPTH_TEST_DISTANCE = 2e4;
export const PORTAL_OCCLUDED_ALPHA = 0.5;
export const PORTAL_NEAR_FAR_SCALAR = new Cesium.NearFarScalar(1e1, 1, 2e4, 0.125);

interface Portal {
  data: PortalData;
  entity: Cesium.Entity;
  occlusionEntity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
}

interface PortalDetailsResponse {
  result: unknown[];
}

export class PortalRequest {
  public portalGuid: string;
  public active: boolean = false;
  public retryCount: number = 0;
  private maxRetries: number = 3;

  public constructor(portalGuid: string) {
    this.portalGuid = portalGuid;
  }

  public async send(): Promise<unknown> {
    this.active = true;
    try {
      const response = await apiRequest("getPortalDetails", { guid: this.portalGuid });
      this.active = false;
      return response;
    } catch (error) {
      this.active = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        return this.send();
      }
      throw error;
    }
  }
}

export class PortalEntityManager {
  private portals: Map<string, Portal> = new Map();
  private portalsPendingCreation: Set<string> = new Set();

  constructor(
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager
  ) {}

  public async requestPortalDetails(guid: string): Promise<void> {
    const request = new PortalRequest(guid);
    const response = await request.send();
    const data = response as PortalDetailsResponse;
    const portalData = parsePortal([guid, data.result[13] as number, data.result]);
    await this.addOrUpdatePortal(portalData);
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
          this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.occlusionEntity);
          this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
          this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.occlusionEntity);
        }
        await this.updatePortalEntity(existing.entity, existing.occlusionEntity, data);
        this.updatePortalPositionSubscription(existing, data);
        existing.data = data;
      }
    } else {
      if (this.portalsPendingCreation.has(data.guid)) return;
      this.portalsPendingCreation.add(data.guid);
      const { entity, occlusionEntity } = await this.createPortalEntity(data);
      const positionCallback: EntityPositionCallback = (_latE6, _lngE6, position) => {
        entity.position = new Cesium.ConstantPositionProperty(position);
        occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
      };
      this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
      this.portals.set(data.guid, { data, entity, occlusionEntity, positionCallback });
      this.portalsPendingCreation.delete(data.guid);
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
    const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `portal-${data.guid}`,
      position: position,
      point: {
        pixelSize: PORTAL_POINT_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
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
        disableDepthTestDistance: PORTAL_DISABLE_DEPTH_TEST_DISTANCE,
        scaleByDistance: PORTAL_NEAR_FAR_SCALAR,
        translucencyByDistance: PORTAL_NEAR_FAR_SCALAR,
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
      entity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      entity.point.disableDepthTestDistance = new Cesium.ConstantProperty(0);
    }
    if (occlusionEntity.point) {
      occlusionEntity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA));
      occlusionEntity.point.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.NONE);
      occlusionEntity.point.disableDepthTestDistance = new Cesium.ConstantProperty(PORTAL_DISABLE_DEPTH_TEST_DISTANCE);
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
      const entities = this.layerManager.getOrCreateDataSourceLayer(layerId).entities;

      entities.remove(portalInfo.entity);
      entities.remove(portalInfo.occlusionEntity);

      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalInfo.data, portalInfo.positionCallback);
      this.portals.delete(guid);
    }
    this.portalsPendingCreation.delete(guid);
  }

  private removePortalEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.portals.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    toRemove.forEach(guid => this.removePortalEntity(guid));
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

export function parsePortal(ent: RawEntity): PortalData {
  const [guid, timestamp, data] = ent;
  const teamCode = data[1] as string;
  const portal: PortalData = {
    guid,
    timestamp,
    team: teamCode === "E" ? "ENLIGHTENED" :
      teamCode === "R" ? "RESISTANCE" :
        teamCode === "M" ? "MACHINA" : "NEUTRAL",
    latE6: data[2] as number,
    lngE6: data[3] as number,
  };

  if (data.length >= 14) {
    portal.level = data[4] as PortalLevel;
    portal.health = data[5] as number;
    portal.resCount = data[6] as number;
    portal.image = data[7] as string;
    portal.title = data[8] as string;
    if (Array.isArray(data[9])) {
      portal.ornaments = data[9] as string[];
    }
  }

  if (data.length >= 18) {
    if (data[14]) {
      portal.mods = (data[14] as unknown[]).map((m): PortalMod | null => {
        if (!Array.isArray(m)) return null;
        return {
          owner: m[0] as string,
          name: m[1] as string,
          rarity: m[2] as string,
          stats: m[3] as Record<string, string>,
        };
      });
    }

    if (data[15]) {
      portal.resonators = (data[15] as unknown[]).map((r): PortalResonator | null => {
        if (!Array.isArray(r)) return null;
        return {
          owner: r[0] as string,
          level: r[1] as number,
          energy: r[2] as number,
        };
      });
    }

    if (data[16]) {
      portal.owner = data[16] as string | undefined;
    }
  }

  if (data.length >= 19) {
    const historyBitArray = (data[18] as number) || 0;
    portal.history = {
      _raw: historyBitArray,
      visited: !!(historyBitArray & 1),
      captured: !!(historyBitArray & 2),
      scoutControlled: !!(historyBitArray & 4),
    };
  }

  return portal;
}
