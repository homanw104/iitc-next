/**
 * Manage field entities.
 */

import * as Cesium from "cesium";
import type { FieldData, PortalData } from "../../types/ingress";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import type { PortalEntityManager } from "./portalEntityManager";

const FIELD_Z_INDEX = 0;
const FIELD_CLASSIFICATION_TYPE = Cesium.ClassificationType.BOTH;

interface Field {
  data: FieldData;
  entity: Cesium.Entity;
  currentLayerId: string;
}

export class FieldEntityManager {
  private fields: Map<string, Field> = new Map();

  constructor(private layerManager: LayerManager, private portalManager: PortalEntityManager) {}

  public async addOrUpdateFields(fields: FieldData[]): Promise<void> {
    await this.addPlaceholderPortals(fields);

    const layers = new Set<string>();
    fields.forEach((field) => {
      const existing = this.fields.get(field.guid);
      if (existing) layers.add(existing.currentLayerId);
      layers.add(getFieldLayerId(field));
    });

    await this.layerManager.withEntityCollectionEventsSuspended(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      async () => {
        fields.forEach((field) => this.addOrUpdateField(field, false));
      }
    );
  }

  public addOrUpdateField(data: FieldData, hydrateAnchorPortals = true): Cesium.Entity {
    if (hydrateAnchorPortals) {
      this.addPlaceholderPortals([data]).then();
    }

    const existing = this.fields.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const newLayerId = getFieldLayerId(data);
        this.moveFieldToLayer(existing, newLayerId);
        this.updateFieldEntity(existing.entity, data);
        existing.data = data;
      }
      return existing.entity;
    }

    const entity = this.createFieldEntity(data);
    this.fields.set(data.guid, { data, entity, currentLayerId: getFieldLayerId(data) });
    return entity;
  }

  private async addPlaceholderPortals(fields: FieldData[]): Promise<void> {
    const placeholders = new Map<string, PortalData>();
    const portalUpdates: Promise<void>[] = [];
    fields.forEach((field) => {
      field.points.forEach((point) => {
        const data = this.portalManager.getPortalData(point.guid);
        if (data) {
          if (addPortalField(data, field)) portalUpdates.push(this.portalManager.addOrUpdatePortal(data));
        } else {
          setNewestPlaceholder(placeholders, {
            guid: point.guid,
            team: field.team,
            latE6: point.latE6,
            lngE6: point.lngE6,
            timestamp: field.timestamp,
            isPlaceholder: true,
            fields: [field],
          });
        }
      });
    });

    await Promise.all(portalUpdates);

    if (placeholders.size === 0) return;

    await this.portalManager.addOrUpdatePortals(Array.from(placeholders.values()));
  }

  public removeField(guid: string): boolean {
    const fieldInfo = this.fields.get(guid);
    if (fieldInfo) {
      this.layerManager.getOrCreateDataSource(fieldInfo.currentLayerId).entities.remove(fieldInfo.entity);
      this.fields.delete(guid);
      return true;
    }
    return false;
  }

  public removeFieldsInView(viewRect: Cesium.Rectangle): void {
    this.removeFieldEntityInView(viewRect);
  }

  private createFieldEntity(data: FieldData): Cesium.Entity {
    const layerId = getFieldLayerId(data);
    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    return this.layerManager.getOrCreateDataSource(layerId).entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: createFieldHierarchy(points),
        material: getTeamColor(data.team).withAlpha(0.2),
        outline: false,
        classificationType: FIELD_CLASSIFICATION_TYPE,
        zIndex: FIELD_Z_INDEX,
      },
      properties: {
        selectable: false,
      }
    });
  }

  private removeFieldEntityInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    this.fields.forEach((info, guid) => {
      if (info.entity.polygon && info.entity.polygon.hierarchy) {
        const hierarchy = info.entity.polygon.hierarchy.getValue(Cesium.JulianDate.now()) as Cesium.PolygonHierarchy;
        if (hierarchy && hierarchy.positions && hierarchy.positions.length > 0) {
          const cartographics = hierarchy.positions.map(p => Cesium.Cartographic.fromCartesian(p));
          const fieldRect = Cesium.Rectangle.fromCartographicArray(cartographics);
          if (Cesium.Rectangle.intersection(viewRect, fieldRect)) {
            toRemove.push(guid);
            layers.add(info.currentLayerId);
          }
        }
      }
    });

    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      () => toRemove.forEach(guid => this.removeField(guid))
    );
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
      entity.polygon.classificationType = new Cesium.ConstantProperty(FIELD_CLASSIFICATION_TYPE);
      entity.polygon.zIndex = new Cesium.ConstantProperty(FIELD_Z_INDEX);
    }
  }

  private moveFieldToLayer(fieldInfo: Field, newLayerId: string): void {
    if (fieldInfo.currentLayerId === newLayerId) return;

    this.layerManager.getOrCreateDataSource(fieldInfo.currentLayerId).entities.remove(fieldInfo.entity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(fieldInfo.entity);
    fieldInfo.currentLayerId = newLayerId;
  }
}

function createFieldHierarchy(points: number[]): Cesium.PolygonHierarchy {
  return new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points));
}

function getFieldLayerId(data: FieldData): string {
  const team = data.team.toLowerCase();
  return `fields-${team}`;
}

function setNewestPlaceholder(placeholders: Map<string, PortalData>, placeholder: PortalData): void {
  const existing = placeholders.get(placeholder.guid);
  if (!existing) {
    placeholders.set(placeholder.guid, placeholder);
    return;
  }

  placeholder.fields?.forEach((field) => addPortalField(existing, field));
  if (placeholder.timestamp > existing.timestamp) {
    existing.team = placeholder.team;
    existing.latE6 = placeholder.latE6;
    existing.lngE6 = placeholder.lngE6;
    existing.timestamp = placeholder.timestamp;
  }
}

function addPortalField(portal: PortalData, field: FieldData): boolean {
  if (portal.fields?.some((existingField) => existingField.guid === field.guid)) return false;

  (portal.fields ??= []).push(field);
  return true;
}
