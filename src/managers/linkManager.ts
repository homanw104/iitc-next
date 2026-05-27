import * as Cesium from "cesium";
import { LinkData, RawEntity } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { PortalManager } from "./portalManager";

export class LinkManager {
  private links: Map<string, { data: LinkData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private portalManager: PortalManager) {}

  public addOrUpdateLink(data: LinkData): Cesium.Entity {
    this.portalManager.createPortalPlaceholderEntity(data.oGuid, data.team, data.oLatE6, data.oLngE6);
    this.portalManager.createPortalPlaceholderEntity(data.dGuid, data.team, data.dLatE6, data.dLngE6);

    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const oldLayerId = this.getLinkLayerId(existing.data);
        const newLayerId = this.getLinkLayerId(data);
        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSource(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateSource(newLayerId).entities.add(existing.entity);
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
      const layerId = this.getLinkLayerId(linkInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(linkInfo.entity);
      this.links.delete(guid);
      return true;
    }
    return false;
  }

  private createLinkEntity(data: LinkData): Cesium.Entity {
    const layerId = this.getLinkLayerId(data);
    const entity = this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `link-${data.guid}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          data.oLngE6 / 1e6, data.oLatE6 / 1e6,
          data.dLngE6 / 1e6, data.dLatE6 / 1e6
        ]),
        width: 2,
        material: getTeamColor(data.team).withAlpha(0.7),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
    (entity as any).selectable = false;
    return entity;
  }

  private updateLinkEntity(entity: Cesium.Entity, data: LinkData): void {
    if (entity.polyline) {
      entity.polyline.positions = new Cesium.ConstantProperty(Cesium.Cartesian3.fromDegreesArray([
        data.oLngE6 / 1e6, data.oLatE6 / 1e6,
        data.dLngE6 / 1e6, data.dLatE6 / 1e6
      ]));
      entity.polyline.material = new Cesium.ColorMaterialProperty(getTeamColor(data.team).withAlpha(0.7));
    }
  }

  private getLinkLayerId(data: LinkData): string {
    const team = data.team.toLowerCase();
    return `links-${team}`;
  }
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
