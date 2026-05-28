import * as Cesium from "cesium";
import { PortalData, PortalLevel, PortalMod, PortalResonator, RawEntity, Team } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { apiRequest } from "../utils/network";

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
      throw error
    }
  }
}

export class PortalManager {
  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager) {}

  public async requestPortalDetails(guid: string): Promise<PortalData> {
    const request = new PortalRequest(guid);
    const response = await request.send();
    const data = response as any;
    const portalData = parsePortal([guid, data.result[13], data.result]);
    this.addOrUpdatePortal(portalData);
    return portalData;
  }

  public addOrUpdatePortal(data: PortalData): Cesium.Entity {
    const existing = this.portals.get(data.guid);
    if (existing) {
      if (data.placeholder) return existing.entity; // Don't downgrade full portal to placeholder
      if (existing.data.placeholder || data.timestamp > existing.data.timestamp) {
        const oldLayerId = this.getPortalLayerId(existing.data);
        const newLayerId = this.getPortalLayerId(data);
        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSource(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateSource(newLayerId).entities.add(existing.entity);
        }
        this.updatePortalEntity(existing.entity, data);
        existing.data = data;
      }
      return existing.entity;
    }

    const portalEntity = this.createPortalEntity(data);
    this.portals.set(data.guid, { data, entity: portalEntity });
    return portalEntity;
  }

  public createPortalPlaceholderEntity(guid: string, team: Team, latE6: number, lngE6: number): void {
    if (this.portals.has(guid)) return;

    this.addOrUpdatePortal({
      guid,
      team,
      latE6,
      lngE6,
      timestamp: 0,
      placeholder: true,
    });
  }

  public removePortal(guid: string): boolean {
    const portalInfo = this.portals.get(guid);
    if (portalInfo) {
      const layerId = this.getPortalLayerId(portalInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(portalInfo.entity);
      this.portals.delete(guid);
      return true;
    }
    return false;
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portals.get(guid)?.data;
  }

  public getPortalEntity(guid: string): Cesium.Entity | undefined {
    return this.portals.get(guid)?.entity;
  }

  private createPortalEntity(data: PortalData): Cesium.Entity {
    const layerId = this.getPortalLayerId(data);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `portal-${data.guid}`,
      position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
      point: {
        pixelSize: 16,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
        color: getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: data.title || "",
        font: "12px sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        eyeOffset: new Cesium.Cartesian3(0, 0, -1),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        outlineWidth: 4,
        outlineColor: Cesium.Color.BLACK,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        translucencyByDistance: new Cesium.NearFarScalar(8e2, 1.0, 1.2e3, 0.0),
      },
    });
  }

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team));
    }
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(data.title || "");
    }
  }

  private getPortalLayerId(data: PortalData): string {
    const team = data.team.toLowerCase();
    const level = data.level ?? 0;
    if (data.placeholder || level === 0) {
      return `portals-placeholder-${team}`;
    }
    return `portals-l${level}-${team}`;
  }
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
      portal.mods = (data[14] as any[]).map((m: any): PortalMod | null => {
        if (!m) return null;
        return {
          owner: m[0],
          name: m[1],
          rarity: m[2],
          stats: m[3],
        };
      });
      portal.resonators = (data[15] as any[]).map((r: any): PortalResonator | null => {
        if (!r) return null;
        return {
          owner: r[0],
          level: r[1],
          energy: r[2],
        };
      });
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
