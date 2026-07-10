/**
 * Manage field primitives.
 */

import * as Cesium from "cesium";
import type { FieldData, FieldPoint } from "../../types/iitc/field.ts";
import type { PortalData } from "../../types/iitc/portal.ts";
import type { LayerManager } from "../layer/layerManager";
import type { PortalEntityManager } from "./portalEntityManager";
import { getTeamColor } from "../../utils/color";
import { TEAMS } from "../../types/common/common.ts";
import { settingsManager } from "../system/settingsManager.ts";

const FIELD_ALPHA = 0.2;
const FIELD_PRIMITIVE_Z_INDEX = 0;
const FIELD_PRIMITIVE_KEY = "fields";

interface Field {
  data: FieldData;
  positions: Cesium.Cartesian3[];
}

export type FieldsChangedCallback = () => void;

export class FieldEntityManager {
  private fields: Map<string, Field> = new Map();
  private fieldsChangedCallbacks: Set<FieldsChangedCallback> = new Set();

  constructor(
    private layerManager: LayerManager,
    private portalManager: PortalEntityManager
  ) {}

  public async addOrUpdateFields(fields: FieldData[]): Promise<void> {
    if (fields.length === 0) return;

    const placeholders = new Map<string, PortalData>();
    fields.forEach((field) => {
      this.addOrUpdatePlaceholders(placeholders, field);
      this.addOrUpdateFieldData(field);
    });

    if (placeholders.size > 0) {
      await this.portalManager.addOrUpdatePortals(Array.from(placeholders.values()));
    }

    this.rebuildLayers();
    this.notifyFieldsChanged();
  }

  public removeFieldsInView(viewRect: Cesium.Rectangle): void {
    this.removeFieldPrimitivesInView(viewRect);
  }

  public getFieldData(guid: string): FieldData | undefined {
    return this.fields.get(guid)?.data;
  }

  public forEachFieldData(callback: (data: FieldData) => void): void {
    this.fields.forEach(field => callback(field.data));
  }

  public addFieldsChangedListener(callback: FieldsChangedCallback): void {
    this.fieldsChangedCallbacks.add(callback);
  }

  public removeFieldsChangedListener(callback: FieldsChangedCallback): void {
    this.fieldsChangedCallbacks.delete(callback);
  }

  private addOrUpdatePlaceholders(placeholders: Map<string, PortalData>, field: FieldData): void {
    field.points.forEach((point) => {
      if (this.portalManager.getPortalData(point.guid)) {
        this.portalManager.addPortalField(point.guid, field);
      } else {
        collectFieldPointPlaceholder(placeholders, field, point);
      }
    });
  }

  private addOrUpdateFieldData(data: FieldData): void {
    const existing = this.fields.get(data.guid);
    if (existing && data.timestamp <= existing.data.timestamp) return;

    const positions = createFieldPositions(data);
    if (existing) {
      existing.data = data;
      existing.positions = positions;
      return;
    }

    this.fields.set(data.guid, { data, positions });
  }

  private removeFieldPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.fields.forEach((field, guid) => {
      if (isFieldInView(field, viewRect)) toRemove.push(guid);
    });

    if (toRemove.length > 0) {
      toRemove.forEach(guid => this.fields.delete(guid));
      this.rebuildLayers();
      this.notifyFieldsChanged();
    }
  }

  private rebuildLayers(): void {
    TEAMS.forEach((team) => {
      this.rebuildLayer(`fields-${team.toLowerCase()}`);
    });
  }

  private rebuildLayer(layerId: string): void {
    const layer = this.layerManager.getOrCreateGroundPrimitiveLayer(layerId, FIELD_PRIMITIVE_Z_INDEX);

    const geometryInstances = Array.from(this.fields.values())
      .filter(field => getFieldLayerId(field.data) === layerId)
      .map(field => createFieldGeometryInstance(field));

    if (geometryInstances.length === 0) {
      layer.removeManagedPrimitive(FIELD_PRIMITIVE_KEY);
    } else {
      layer.replacePrimitiveWhenReady(FIELD_PRIMITIVE_KEY, new Cesium.GroundPrimitive({
        geometryInstances,
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
        }),
        allowPicking: false,
        asynchronous: true,
        classificationType: getFieldClassificationType(),
      }));
    }
  }

  private notifyFieldsChanged(): void {
    this.fieldsChangedCallbacks.forEach(callback => callback());
  }
}

function createFieldGeometryInstance(field: Field): Cesium.GeometryInstance {
  return new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({
      polygonHierarchy: new Cesium.PolygonHierarchy(field.positions),
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(getTeamColor(field.data.team).withAlpha(FIELD_ALPHA)),
    },
  });
}

function createFieldPositions(data: FieldData): Cesium.Cartesian3[] {
  return data.points.map(point => Cesium.Cartesian3.fromDegrees(point.lngE6 / 1e6, point.latE6 / 1e6));
}

function isFieldInView(field: Field, viewRect: Cesium.Rectangle): boolean {
  const cartographics = field.positions.map(position => Cesium.Cartographic.fromCartesian(position));
  const fieldRect = Cesium.Rectangle.fromCartographicArray(cartographics);
  return Cesium.Rectangle.intersection(viewRect, fieldRect) !== undefined;
}

function getFieldLayerId(data: FieldData): string {
  const team = data.team.toLowerCase();
  return `fields-${team}`;
}

function getFieldClassificationType(): Cesium.ClassificationType {
  return settingsManager.getUseGoogle3dTiles()
    ? Cesium.ClassificationType.CESIUM_3D_TILE
    : Cesium.ClassificationType.TERRAIN;
}

function collectFieldPointPlaceholder(
  placeholders: Map<string, PortalData>,
  field: FieldData,
  point: FieldPoint,
): void {
  const existing = placeholders.get(point.guid);
  if (existing) {
    addPortalField(existing, field);
  } else {
    placeholders.set(point.guid, {
      guid: point.guid,
      team: field.team,
      latE6: point.latE6,
      lngE6: point.lngE6,
      isPlaceholder: true,
      fields: [field],
    });
  }
}

function addPortalField(portal: PortalData, field: FieldData): void {
  if (!portal.fields?.some((existingField) => existingField.guid === field.guid)) {
    (portal.fields ??= []).push(field);
  }
}
