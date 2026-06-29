/**
 * Manage link entities.
 */

import * as Cesium from "cesium";
import type { LinkData, PortalData } from "../../types/ingress";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import type { PortalEntityManager } from "./portalEntityManager";

interface Link {
  data: LinkData;
  entity: Cesium.Entity;
  currentLayerId: string;
}

export class LinkEntityManager {
  private links: Map<string, Link> = new Map();

  constructor(
    private layerManager: LayerManager,
    private portalManager: PortalEntityManager
  ) {}

  public async addOrUpdateLinks(links: LinkData[]): Promise<void> {
    await this.addPlaceholderPortals(links);

    const layers = new Set<string>();
    links.forEach((link) => {
      const existing = this.links.get(link.guid);
      if (existing) layers.add(existing.currentLayerId);
      layers.add(getLinkLayerId(link));
    });

    await this.layerManager.withEntityCollectionEventsSuspended(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      async () => {
        links.forEach((link) => this.addOrUpdateLink(link, false));
      }
    );
  }

  public addOrUpdateLink(data: LinkData, hydrateEndpointPortals = true): Cesium.Entity {
    if (hydrateEndpointPortals) {
      this.addPlaceholderPortals([data]).then();
    }

    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const newLayerId = getLinkLayerId(data);
        this.moveLinkToLayer(existing, newLayerId);
        this.updateLinkEntity(existing.entity, data);
        existing.data = data;
      }
      return existing.entity;
    }

    const entity = this.createLinkEntity(data);
    this.links.set(data.guid, { data, entity, currentLayerId: getLinkLayerId(data) });
    return entity;
  }

  private async addPlaceholderPortals(links: LinkData[]): Promise<void> {
    const placeholders = new Map<string, PortalData>();
    links.forEach((link) => {
      if (!this.portalManager.addPortalLink(link.oGuid, link)) {
        setNewestPlaceholder(placeholders, {
          guid: link.oGuid,
          team: link.team,
          latE6: link.oLatE6,
          lngE6: link.oLngE6,
          timestamp: link.timestamp,
          isPlaceholder: true,
          links: [link],
        });
      }

      if (!this.portalManager.addPortalLink(link.dGuid, link)) {
        setNewestPlaceholder(placeholders, {
          guid: link.dGuid,
          team: link.team,
          latE6: link.dLatE6,
          lngE6: link.dLngE6,
          timestamp: link.timestamp,
          isPlaceholder: true,
          links: [link],
        });
      }
    });

    if (placeholders.size === 0) return;

    await this.portalManager.addOrUpdatePortals(Array.from(placeholders.values()));
  }

  public removeLink(guid: string): boolean {
    const linkInfo = this.links.get(guid);
    if (linkInfo) {
      this.layerManager.getOrCreateDataSource(linkInfo.currentLayerId).entities.remove(linkInfo.entity);
      this.links.delete(guid);
      return true;
    }
    return false;
  }

  public removeLinksInView(viewRect: Cesium.Rectangle): void {
    this.removeLinkEntityInView(viewRect);
  }

  private createLinkEntity(data: LinkData): Cesium.Entity {
    const layerId = getLinkLayerId(data);
    return this.layerManager.getOrCreateDataSource(layerId).entities.add({
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
    });
  }

  private removeLinkEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    this.links.forEach((info, guid) => {
      if (info.entity.polyline && info.entity.polyline.positions) {
        const positions = info.entity.polyline.positions.getValue(Cesium.JulianDate.now()) as Cesium.Cartesian3[];
        if (positions && positions.length > 1) {
          const carto1 = Cesium.Cartographic.fromCartesian(positions[0]);
          const carto2 = Cesium.Cartographic.fromCartesian(positions[1]);
          const linkRect = Cesium.Rectangle.fromCartographicArray([carto1, carto2]);
          if (Cesium.Rectangle.intersection(viewRect, linkRect)) {
            toRemove.push(guid);
            layers.add(info.currentLayerId);
          }
        }
      }
    });

    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      () => toRemove.forEach(guid => this.removeLink(guid))
    );
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

  private moveLinkToLayer(linkInfo: Link, newLayerId: string): void {
    if (linkInfo.currentLayerId === newLayerId) return;

    this.layerManager.getOrCreateDataSource(linkInfo.currentLayerId).entities.remove(linkInfo.entity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(linkInfo.entity);
    linkInfo.currentLayerId = newLayerId;
  }
}

function getLinkLayerId(data: LinkData): string {
  const team = data.team.toLowerCase();
  return `links-${team}`;
}

function setNewestPlaceholder(placeholders: Map<string, PortalData>, placeholder: PortalData): void {
  const existing = placeholders.get(placeholder.guid);
  if (!existing) {
    placeholders.set(placeholder.guid, placeholder);
    return;
  }

  placeholder.links?.forEach((link) => addPortalLink(existing, link));
  if (placeholder.timestamp && placeholder.timestamp > (existing.timestamp ?? 0)) {
    existing.team = placeholder.team;
    existing.latE6 = placeholder.latE6;
    existing.lngE6 = placeholder.lngE6;
    existing.timestamp = placeholder.timestamp;
  }
}

function addPortalLink(portal: PortalData, link: LinkData): boolean {
  if (portal.links?.some((existingLink) => existingLink.guid === link.guid)) return false;

  (portal.links ??= []).push(link);
  return true;
}
