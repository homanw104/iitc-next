/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { PortalData, LinkData, FieldData, Team, RawEntity } from "../types/ingress";
import { ParsedEntities } from "../types/map";
import { logger } from "./logger";

/**
 * Manages game entities and their Cesium representations.
 */
export class EntityManager {
  private viewer: Cesium.Viewer;
  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();
  private links: Map<string, { data: LinkData; entity: Cesium.Entity }> = new Map();
  private fields: Map<string, { data: FieldData; entity: Cesium.Entity }> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(this.getTeamColor(data.team));
      entity.point.pixelSize = new Cesium.ConstantProperty(data.placeholder ? 4 : 8);
    }
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(data.title || "");
    }
  }

  private updateLinkEntity(entity: Cesium.Entity, data: LinkData): void {
    if (entity.polyline) {
      entity.polyline.positions = new Cesium.ConstantProperty(Cesium.Cartesian3.fromDegreesArray([
        data.oLngE6 / 1e6, data.oLatE6 / 1e6,
        data.dLngE6 / 1e6, data.dLatE6 / 1e6
      ]));
      entity.polyline.material = new Cesium.ColorMaterialProperty(this.getTeamColor(data.team).withAlpha(0.7));
    }
  }

  private updateFieldEntity(entity: Cesium.Entity, data: FieldData): void {
    if (entity.polygon) {
      const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
      entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)));
      entity.polygon.material = new Cesium.ColorMaterialProperty(this.getTeamColor(data.team).withAlpha(0.2));
    }
  }

  private ensurePortalPlaceholder(guid: string, team: Team, latE6: number, lngE6: number): void {
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

  public addOrUpdatePortal(data: PortalData): void {
    const existing = this.portals.get(data.guid);
    if (existing) {
      if (data.placeholder) return; // Don't downgrade full portal to placeholder
      if (existing.data.placeholder || data.timestamp > existing.data.timestamp) {
        this.updatePortalEntity(existing.entity, data);
        existing.data = data;
      }
      return;
    }

    const portalEntity = this.viewer.entities.add({
      id: `portal-${data.guid}`,
      position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
      point: {
        pixelSize: data.placeholder ? 4 : 8,
        color: this.getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: data.title || "",
        font: "12px sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // Ensure label is visible
      },
    });
    logger.debug("EntityManager", `Added portal: ${data.title || data.guid} at ${data.latE6 / 1e6}, ${data.lngE6 / 1e6}`);
    this.portals.set(data.guid, { data, entity: portalEntity });
  }
  
  public addOrUpdateLink(data: LinkData): void {
    this.ensurePortalPlaceholder(data.oGuid, data.team, data.oLatE6, data.oLngE6);
    this.ensurePortalPlaceholder(data.dGuid, data.team, data.dLatE6, data.dLngE6);

    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        this.updateLinkEntity(existing.entity, data);
        existing.data = data;
      }
      return;
    }

    const entity = this.viewer.entities.add({
      id: `link-${data.guid}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          data.oLngE6 / 1e6, data.oLatE6 / 1e6,
          data.dLngE6 / 1e6, data.dLatE6 / 1e6
        ]),
        width: 2,
        material: this.getTeamColor(data.team).withAlpha(0.7),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });

    this.links.set(data.guid, { data, entity });
  }

  public addOrUpdateField(data: FieldData): void {
    data.points.forEach((p) => {
      this.ensurePortalPlaceholder(p.guid, data.team, p.latE6, p.lngE6);
    });

    const existing = this.fields.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        this.updateFieldEntity(existing.entity, data);
        existing.data = data;
      }
      return;
    }

    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    const entity = this.viewer.entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)),
        material: this.getTeamColor(data.team).withAlpha(0.2),
        outline: false,
      },
    });

    this.fields.set(data.guid, { data, entity });
  }

  public removeEntity(guid: string): void {
    if (this.portals.has(guid)) {
      this.viewer.entities.remove(this.portals.get(guid)!.entity);
      this.portals.delete(guid);
    } else if (this.links.has(guid)) {
      this.viewer.entities.remove(this.links.get(guid)!.entity);
      this.links.delete(guid);
    } else if (this.fields.has(guid)) {
      this.viewer.entities.remove(this.fields.get(guid)!.entity);
      this.fields.delete(guid);
    }
  }

  private getTeamColor(team: Team): Cesium.Color {
    switch (team) {
      case "ENLIGHTENED": return Cesium.Color.LIME;
      case "RESISTANCE": return Cesium.Color.BLUE;
      case "MACHINA": return Cesium.Color.RED;
      case "NEUTRAL": return Cesium.Color.LIGHTGRAY;
      default: return Cesium.Color.WHITE;
    }
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
  const team = teamCode === "E" ? "ENLIGHTENED" :
               teamCode === "R" ? "RESISTANCE" :
               teamCode === "M" ? "MACHINA" : "NEUTRAL";
  const latE6 = data[2] as number;
  const lngE6 = data[3] as number;

  const portal: PortalData = {
    guid,
    timestamp,
    team,
    latE6,
    lngE6,
  };

  if (data.length >= 14) {
    portal.level = data[4] as number;
    portal.health = data[5] as number;
    portal.resCount = data[6] as number;
    portal.image = data[7] as string;
    portal.title = data[8] as string;
  }

  return portal;
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

/**
 * Parses a raw entity into structured FieldData.
 *
 * @param ent - The raw entity to be parsed, expected to be an array where the first element is a GUID (string),
 *              the second element is a timestamp (number), and the third element is an array containing team data
 *              and point data.
 *
 * @return A structured FieldData object with properties for guid, timestamp, team, and points.
 */
export function parseField(ent: RawEntity): FieldData {
  const [guid, timestamp, data] = ent;
  const teamCode = data[1] as string;
  const team = teamCode === "E" ? "ENLIGHTENED" :
               teamCode === "R" ? "RESISTANCE" :
               teamCode === "M" ? "MACHINA" : "NEUTRAL";
  const points = (data[2] as unknown[][]).map((p) => ({
    guid: p[0] as string,
    latE6: p[1] as number,
    lngE6: p[2] as number,
  }));

  return {
    guid,
    timestamp,
    team,
    points,
  };
}

/**
 * Parses an array of raw entities into categorized data structures.
 *
 * @param entities - An array of raw entity objects to be parsed.
 * @returns An object containing arrays of parsed portal, link, and field data.
 */
export function parseTileEntities(entities: RawEntity[]): ParsedEntities {
  const portals: PortalData[] = [];
  const links: LinkData[] = [];
  const fields: FieldData[] = [];

  for (const ent of entities) {
    const type = ent[2][0];
    switch (type) {
      case "p":
        portals.push(parsePortal(ent));
        break;
      case "e":
        links.push(parseLink(ent));
        break;
      case "r":
        fields.push(parseField(ent));
        break;
    }
  }

  return { portals, links, fields };
}
