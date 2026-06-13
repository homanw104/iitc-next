/**
 * Manage link entities.
 */

import * as Cesium from "cesium";
import { LinkData, PortalData, RawEntity } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { PortalEntityManager } from "./portalEntityManager";

export class LinkEntityManager {
  private links: Map<string, { data: LinkData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private portalManager: PortalEntityManager) {}

  public addOrUpdateLink(data: LinkData): Cesium.Entity {
    this.portalManager.addOrUpdatePortal({
      guid: data.oGuid,
      team: data.team,
      latE6: data.oLatE6,
      lngE6: data.oLngE6,
      isPlaceholder: true,
    } as PortalData);

    this.portalManager.addOrUpdatePortal({
      guid: data.dGuid,
      team: data.team,
      latE6: data.dLatE6,
      lngE6: data.dLngE6,
      isPlaceholder: true,
    } as PortalData);

    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const oldLayerId = getLinkLayerId(existing.data);
        const newLayerId = getLinkLayerId(data);
        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSourceAndFilter(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateSourceAndFilter(newLayerId).entities.add(existing.entity);
        }
        this.updateLinkEntity(existing.entity, data);
        existing.data = data;
      }
      return existing.entity;
    }

    const entity = this.createLinkEntity(data);
    this.links.set(data.guid, { data, entity });
    return entity;
  }

  public removeLink(guid: string): boolean {
    const linkInfo = this.links.get(guid);
    if (linkInfo) {
      const layerId = getLinkLayerId(linkInfo.data);
      this.layerManager.getOrCreateSourceAndFilter(layerId).entities.remove(linkInfo.entity);
      this.links.delete(guid);
      return true;
    }
    return false;
  }

  public removeLinkInView(viewRect: Cesium.Rectangle): void {
    this.removeLinkEntityInView(viewRect);
  }

  private createLinkEntity(data: LinkData): Cesium.Entity {
    const layerId = getLinkLayerId(data);
    return this.layerManager.getOrCreateSourceAndFilter(layerId).entities.add({
      id: `link-${data.guid}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          data.oLngE6 / 1e6, data.oLatE6 / 1e6,
          data.dLngE6 / 1e6, data.dLatE6 / 1e6
        ]),
        width: 2,
        material: getTeamColor(data.team).withAlpha(0.7),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: true,
        zIndex: 10,
      },
      properties: {
        selectable: false,
      }
    });
  }

  private removeLinkEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.links.forEach((info, guid) => {
      if (info.entity.polyline && info.entity.polyline.positions) {
        const positions = info.entity.polyline.positions.getValue(Cesium.JulianDate.now()) as Cesium.Cartesian3[];
        if (positions && positions.length > 1) {
          const carto1 = Cesium.Cartographic.fromCartesian(positions[0]);
          const carto2 = Cesium.Cartographic.fromCartesian(positions[1]);
          const linkRect = Cesium.Rectangle.fromCartographicArray([carto1, carto2]);
          if (Cesium.Rectangle.intersection(viewRect, linkRect)) {
            toRemove.push(guid);
          }
        }
      }
    });

    toRemove.forEach(guid => this.removeLink(guid));
  }

  private updateLinkEntity(entity: Cesium.Entity, data: LinkData): void {
    if (entity.polyline) {
      entity.polyline.positions = new Cesium.ConstantProperty(Cesium.Cartesian3.fromDegreesArray([
        data.oLngE6 / 1e6, data.oLatE6 / 1e6,
        data.dLngE6 / 1e6, data.dLatE6 / 1e6
      ]));
      entity.polyline.material = new Cesium.ColorMaterialProperty(getTeamColor(data.team).withAlpha(0.7));
      entity.polyline.clampToGround = new Cesium.ConstantProperty(true);
      entity.polyline.zIndex = new Cesium.ConstantProperty(10);
    }
  }
}

/**
 * Retrieves a link layer ID based on the provided team information.
 *
 * @param {LinkData} data - An object containing team details.
 * @return {string} A formatted string representing the link layer ID.
 */
export function getLinkLayerId(data: LinkData): string {
  const team = data.team.toLowerCase();
  return `links-${team}`;
}

/**
 * Parses a raw entity into a structured LinkData object.
 *
 * @param ent - An array representing the raw entity with structured information.
 * @returns A LinkData object containing parsed information from the raw entity.
 */
export function parseLink(ent: RawEntity): LinkData {
  const [guid, timestamp, data] = ent;
  const teamCode = data[1] as string;
  return {
    guid,
    timestamp,
    team: teamCode === "E" ? "ENLIGHTENED" :
      teamCode === "R" ? "RESISTANCE" :
        teamCode === "M" ? "MACHINA" : "NEUTRAL",
    oGuid: data[2] as string,
    oLatE6: data[3] as number,
    oLngE6: data[4] as number,
    dGuid: data[5] as string,
    dLatE6: data[6] as number,
    dLngE6: data[7] as number,
  };
}
