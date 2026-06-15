/**
 * Manage field entities.
 */

import * as Cesium from "cesium";
import { FieldData, PortalData, RawEntity } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { PortalEntityManager } from "./portalEntityManager";

const FIELD_HEIGHT = 0;

export class FieldEntityManager {
  private fields: Map<string, { data: FieldData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private portalManager: PortalEntityManager) {}

  public addOrUpdateField(data: FieldData): Cesium.Entity {
    data.points.forEach((p) => {
      this.portalManager.addOrUpdatePortal({
        guid: p.guid,
        team: data.team,
        latE6: p.latE6,
        lngE6: p.lngE6,
        isPlaceholder: true,
      } as PortalData);
    });

    const existing = this.fields.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const oldLayerId = getFieldLayerId(existing.data);
        const newLayerId = getFieldLayerId(data);
        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateDataSourceLayer(oldLayerId).entities.remove(existing.entity);
          this.layerManager.getOrCreateDataSourceLayer(newLayerId).entities.add(existing.entity);
        }
        this.updateFieldEntity(existing.entity, data);
        existing.data = data;
      }
      return existing.entity;
    }

    const entity = this.createFieldEntity(data);
    this.fields.set(data.guid, { data, entity });
    return entity;
  }

  public removeField(guid: string): boolean {
    const fieldInfo = this.fields.get(guid);
    if (fieldInfo) {
      const layerId = getFieldLayerId(fieldInfo.data);
      this.layerManager.getOrCreateDataSourceLayer(layerId).entities.remove(fieldInfo.entity);
      this.fields.delete(guid);
      return true;
    }
    return false;
  }

  public removeFieldInView(viewRect: Cesium.Rectangle): void {
    this.removeFieldEntityInView(viewRect);
  }

  private createFieldEntity(data: FieldData): Cesium.Entity {
    const layerId = getFieldLayerId(data);
    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    return this.layerManager.getOrCreateDataSourceLayer(layerId).entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)),
        height: FIELD_HEIGHT,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        material: getTeamColor(data.team).withAlpha(0.2),
        outline: false,
      },
      properties: {
        selectable: false,
      }
    });
  }

  private removeFieldEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.fields.forEach((info, guid) => {
      if (info.entity.polygon && info.entity.polygon.hierarchy) {
        const hierarchy = info.entity.polygon.hierarchy.getValue(Cesium.JulianDate.now()) as Cesium.PolygonHierarchy;
        if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
          const cartographics = hierarchy.positions.map(p => Cesium.Cartographic.fromCartesian(p));
          const fieldRect = Cesium.Rectangle.fromCartographicArray(cartographics);
          if (Cesium.Rectangle.intersection(viewRect, fieldRect)) {
            toRemove.push(guid);
          }
        }
      }
    });

    toRemove.forEach(guid => this.removeField(guid));
  }

  private updateFieldEntity(entity: Cesium.Entity, data: FieldData): void {
    if (entity.polygon) {
      const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
      entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)));
      entity.polygon.height = new Cesium.ConstantProperty(FIELD_HEIGHT);
      entity.polygon.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND);
      entity.polygon.material = new Cesium.ColorMaterialProperty(getTeamColor(data.team).withAlpha(0.2));
    }
  }
}

/**
 * Generates a field layer ID based on the provided team data.
 *
 * @param {FieldData} data - The data object containing the team information.
 * @returns {string} The generated field layer ID in the format 'fields-teamName'.
 */
export function getFieldLayerId(data: FieldData): string {
  const team = data.team.toLowerCase();
  return `fields-${team}`;
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
