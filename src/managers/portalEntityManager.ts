/**
 * Manage portal entities.
 */

import * as Cesium from "cesium";
import { PortalData, PortalLevel, PortalMod, PortalResonator, RawEntity } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { apiRequest } from "../utils/network";
import { EntityPositionManager } from "./entityPositionManager";

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
  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private entityPositionManager: EntityPositionManager) {
    this.entityPositionManager.setOnPositionChangedCallback((latE6, lngE6, position) => {
      this.portals.forEach(({ data, entity }) => {
        if (data.latE6 === latE6 && data.lngE6 === lngE6) {
          entity.position = new Cesium.ConstantPositionProperty(position);
        }
      });
    });
  }

  public addOrUpdatePortal(data: PortalData): void {
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
          this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
        }
        this.updatePortalEntity(existing.entity, data);
        existing.data = data;
      }
      return;
    }

    const portalEntity = this.createPortalEntity(data);
    this.portals.set(data.guid, { data, entity: portalEntity });
  }

  public removePortalInView(viewRect: Cesium.Rectangle): void {
    this.removePortalEntityInView(viewRect);
  }

  public async requestPortalDetails(guid: string): Promise<void> {
    const request = new PortalRequest(guid);
    const response = await request.send();
    const data = response as PortalDetailsResponse;
    const portalData = parsePortal([guid, data.result[13] as number, data.result]);
    this.addOrUpdatePortal(portalData);
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portals.get(guid)?.data;
  }

  public getPortalEntity(guid: string): Cesium.Entity | undefined {
    return this.portals.get(guid)?.entity;
  }

  public getPortalDataByCoordinates(latE6: number, lngE6: number): PortalData | undefined {
    return Array.from(this.portals.values()).find(({ data }) =>
      data.latE6 === latE6 && data.lngE6 === lngE6
    )?.data;
  }

  private createPortalEntity(data: PortalData): Cesium.Entity {
    const layerId = getPortalLayerId(data);
    return this.layerManager.getOrCreateDataSourceLayer(layerId).entities.add({
      id: `portal-${data.guid}`,
      position: this.entityPositionManager.getPosition(data),
      point: {
        pixelSize: 16,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        color: getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      properties: {
        selectable: true,
      },
    });
  }

  private removePortalEntity(guid: string): void {
    const portalInfo = this.portals.get(guid);
    if (portalInfo) {
      const layerId = getPortalLayerId(portalInfo.data);
      this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(portalInfo.entity);
      this.portals.delete(guid);
    }
  }
  
  private removePortalEntityInView(viewRect: Cesium.Rectangle): void {
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

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    entity.position = new Cesium.ConstantPositionProperty(this.entityPositionManager.getPosition(data));
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team));
    }
  }
}

/**
 * Retrieves the portal layer ID based on the provided data.
 *
 * @param {PortalData} data - An object containing team, level, and isPlaceholder properties.
 * @returns {string} The generated portal layer ID.
 */
export function getPortalLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (data.isPlaceholder || level === 0) {
    return `portals-placeholder-${team}`;
  }
  return `portals-l${level}-${team}`;
}

/**
 * Parses a raw entity into a PortalData object.
 *
 * @param ent - An array representing the raw entity, where the first element is the GUID,
 *              the second is the timestamp, and the third is an array of additional data.
 * @return A PortalData object containing the parsed information from the raw entity.
 */
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

    if (data.length >= 19) {
      const historyBitArray = (data[18] as number) || 0;
      portal.history = {
        _raw: historyBitArray,
        visited: !!(historyBitArray & 1),
        captured: !!(historyBitArray & 2),
        scoutControlled: !!(historyBitArray & 4),
      };
    }
  }

  return portal;
}
