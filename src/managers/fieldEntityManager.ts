/**
 * Manage field entities.
 */

import * as Cesium from "cesium";
import { FieldData, PortalData, RawEntity } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { PortalEntityManager } from "./portalEntityManager";

const FIELD_Z_INDEX = 0;

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
        hierarchy: createFieldHierarchy(points),
        material: getTeamColor(data.team).withAlpha(0.2),
        outline: false,
        classificationType: Cesium.ClassificationType.TERRAIN,
        zIndex: FIELD_Z_INDEX,
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
      entity.polygon.hierarchy = new Cesium.ConstantProperty(createFieldHierarchy(points));
      entity.polygon.height = undefined;
      entity.polygon.heightReference = undefined;
      entity.polygon.extrudedHeight = undefined;
      entity.polygon.extrudedHeightReference = undefined;
      entity.polygon.material = new Cesium.ColorMaterialProperty(getTeamColor(data.team).withAlpha(0.2));
      entity.polygon.classificationType = new Cesium.ConstantProperty(Cesium.ClassificationType.TERRAIN);
      entity.polygon.zIndex = new Cesium.ConstantProperty(FIELD_Z_INDEX);
    }
  }
}

/**
 * Creates a field hierarchy from an array of points represented in degrees.
 *
 * @param points - An array of numbers representing the longitude and latitude pairs in degrees.
 *                 The array should be in the format [longitude1, latitude1, longitude2, latitude2, ...].
 *                 The number of elements must be even, as each point requires a longitude and latitude pair.
 *
 * @return A new Cesium.PolygonHierarchy object created from the provided points.
 */
function createFieldHierarchy(points: number[]): Cesium.PolygonHierarchy {
  return new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points));
}

function getFieldLayerId(data: FieldData): string {
  const team = data.team.toLowerCase();
  return `fields-${team}`;
}

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
