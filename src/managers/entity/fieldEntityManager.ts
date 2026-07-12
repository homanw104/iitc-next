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
import { logManager } from "../system/logManager.ts";
import type {
  FieldCoverageLayerInput,
  FieldCoverageMultiPolygon,
  FieldCoveragePolygon,
  FieldCoverageRing,
  FieldCoverageResponse,
} from "./fieldCoverage.ts";
import { createFieldCoverageWorker } from "./fieldCoverageWorker.ts";
import { createOverlapAwareFieldBatches } from "./fieldOverlapBatching.ts";

const FIELD_ALPHA = 0.2;
const FIELD_PRIMITIVE_Z_INDEX = 0;
const FIELD_PRIMITIVE_KEY = "fields";
const LOG_TAG = "FieldEntityManager";

interface Field {
  data: FieldData;
  positions: Cesium.Cartesian3[];
}

export type FieldsChangedCallback = () => void;
export type FieldRenderingMode = "none" | "coverage" | "overlap-fallback";

export class FieldEntityManager {
  private fields: Map<string, Field> = new Map();
  private fieldsChangedCallbacks: Set<FieldsChangedCallback> = new Set();
  private fieldCoverageWorker?: Worker;
  private fieldCoverageGeneration = 0;
  private renderingMode: FieldRenderingMode = "none";

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
    this.clearFieldCoverageWorker();
    const generation = ++this.fieldCoverageGeneration;
    const layers: FieldCoverageLayerInput[] = [];

    TEAMS.forEach((team) => {
      const layerId = `fields-${team.toLowerCase()}`;
      const fields = this.getFieldsInLayer(layerId);
      if (fields.length === 0) {
        this.layerManager.getOrCreateGroundPrimitiveLayer(layerId, FIELD_PRIMITIVE_Z_INDEX)
          .removeManagedPrimitive(FIELD_PRIMITIVE_KEY);
      } else {
        layers.push({
          layerId,
          fields: fields.map(field => ({
            guid: field.data.guid,
            points: field.data.points,
          })),
        });
      }
    });

    if (layers.length === 0) {
      this.renderingMode = "none";
      return;
    }

    try {
      this.fieldCoverageWorker = createFieldCoverageWorker();
    } catch (error) {
      this.rebuildLayersWithOverlapBatches("the coverage worker could not be created", error);
      return;
    }
    this.fieldCoverageWorker.addEventListener("message", this.handleFieldCoverageMessage);
    this.fieldCoverageWorker.addEventListener("error", this.handleFieldCoverageError);
    this.fieldCoverageWorker.postMessage({ generation, layers });
  }

  private getFieldsInLayer(layerId: string): Field[] {
    return Array.from(this.fields.values()).filter(field => getFieldLayerId(field.data) === layerId);
  }

  private rebuildLayer(layerId: string, coverageByDepth?: FieldCoverageMultiPolygon[]): void {
    const layer = this.layerManager.getOrCreateGroundPrimitiveLayer(layerId, FIELD_PRIMITIVE_Z_INDEX);
    const fields = this.getFieldsInLayer(layerId);

    if (fields.length === 0) {
      layer.removeManagedPrimitive(FIELD_PRIMITIVE_KEY);
    } else {
      layer.replaceGroundPrimitivesWhenReady(FIELD_PRIMITIVE_KEY, createFieldPrimitives(fields, coverageByDepth));
    }
  }

  private handleFieldCoverageMessage = (event: MessageEvent<FieldCoverageResponse>): void => {
    if (event.data.generation !== this.fieldCoverageGeneration) return;

    this.clearFieldCoverageWorker();
    if ("error" in event.data) {
      this.rebuildLayersWithOverlapBatches("coverage preprocessing failed", event.data.error);
      return;
    }

    if (event.data.layers.some(layer => !layer.coverageByDepth.some(coverage => coverage.length > 0))) {
      this.rebuildLayersWithOverlapBatches("coverage preprocessing returned no geometry");
      return;
    }

    try {
      event.data.layers.forEach(layer => this.rebuildLayer(layer.layerId, layer.coverageByDepth));
    } catch (error) {
      this.rebuildLayersWithOverlapBatches("coverage geometry could not be created", error);
      return;
    }

    this.renderingMode = "coverage";
    logManager.debug(LOG_TAG, "Using fragmented field coverage");
  };

  private handleFieldCoverageError = (event: ErrorEvent): void => {
    this.clearFieldCoverageWorker();
    this.rebuildLayersWithOverlapBatches("the coverage worker failed", event.error ?? event.message);
  };

  private rebuildLayersWithOverlapBatches(reason: string, error?: unknown): void {
    this.renderingMode = "overlap-fallback";
    if (error === undefined) {
      logManager.warn(LOG_TAG, `Using overlap-aware field fallback because ${reason}.`);
    } else {
      logManager.warn(LOG_TAG, `Using overlap-aware field fallback because ${reason}.`, error);
    }
    TEAMS.forEach(team => this.rebuildLayer(`fields-${team.toLowerCase()}`));
  }

  private clearFieldCoverageWorker(): void {
    this.fieldCoverageWorker?.removeEventListener("message", this.handleFieldCoverageMessage);
    this.fieldCoverageWorker?.removeEventListener("error", this.handleFieldCoverageError);
    this.fieldCoverageWorker?.terminate();
    this.fieldCoverageWorker = undefined;
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

function createFieldCoverageGeometryInstance(
  polygon: FieldCoveragePolygon,
  field: Field,
  depth: number,
): Cesium.GeometryInstance | undefined {
  const hierarchy = createPolygonHierarchy(polygon);
  if (!hierarchy) return undefined;

  const alpha = 1 - (1 - FIELD_ALPHA) ** depth;
  return new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({
      polygonHierarchy: hierarchy,
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(getTeamColor(field.data.team).withAlpha(alpha)),
    },
  });
}

function createFieldPrimitives(
  fields: Field[],
  coverageByDepth?: FieldCoverageMultiPolygon[],
): Cesium.GroundPrimitive[] {
  const appearance = new Cesium.PerInstanceColorAppearance({
    flat: true,
    translucent: true,
  });
  const classificationType = getFieldClassificationType();

  // Different depths need separate classification passes, or a shadow volume can supply the wrong alpha.
  const geometryInstanceBatches = coverageByDepth
    ? createFieldCoverageGeometryInstanceBatches(fields, coverageByDepth)
    : createOverlapAwareFieldBatches(fields).map(batch =>
      batch.map(field => createFieldGeometryInstance(field))
    );
  if (geometryInstanceBatches.length === 0) throw new Error("Field geometry is empty.");

  return geometryInstanceBatches.map(geometryInstances => new Cesium.GroundPrimitive({
    geometryInstances,
    appearance,
    allowPicking: false,
    asynchronous: true,
    classificationType,
  }));
}

function createFieldCoverageGeometryInstanceBatches(
  fields: Field[],
  coverageByDepth: FieldCoverageMultiPolygon[],
): Cesium.GeometryInstance[][] {
  const field = fields[0];
  if (!field) return [];

  return coverageByDepth.map((coverage, index) =>
    coverage.flatMap((polygon) => {
      const instance = createFieldCoverageGeometryInstance(polygon, field, index + 1);
      return instance ? [instance] : [];
    })
  ).filter(instances => instances.length > 0);
}

function createPolygonHierarchy(polygon: FieldCoveragePolygon): Cesium.PolygonHierarchy | undefined {
  const [outerRing, ...holeRings] = polygon;
  const positions = createRingPositions(outerRing);
  if (positions.length < 3) return undefined;

  const holes = holeRings
    .map(createRingPositions)
    .filter(holePositions => holePositions.length >= 3)
    .map(holePositions => new Cesium.PolygonHierarchy(holePositions));
  return new Cesium.PolygonHierarchy(positions, holes);
}

function createRingPositions(ring: FieldCoverageRing): Cesium.Cartesian3[] {
  return ring.slice(0, -1)
    .map(([longitude, latitude]) => Cesium.Cartesian3.fromDegrees(longitude, latitude));
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
