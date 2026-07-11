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
  unitPositions: Cesium.Cartesian3[];
  sphericalArea: number;
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
    const unitPositions = createFieldUnitPositions(data);
    const sphericalArea = getSphericalTriangleArea(unitPositions);
    if (existing) {
      existing.data = data;
      existing.positions = positions;
      existing.unitPositions = unitPositions;
      existing.sphericalArea = sphericalArea;
      return;
    }

    this.fields.set(data.guid, { data, positions, unitPositions, sphericalArea });
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

    const fields = Array.from(this.fields.values())
      .filter(field => getFieldLayerId(field.data) === layerId);

    if (fields.length === 0) {
      layer.removeManagedPrimitive(FIELD_PRIMITIVE_KEY);
    } else {
      layer.replacePrimitiveWhenReady(FIELD_PRIMITIVE_KEY, createFieldPrimitiveGroup(fields));
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

function createFieldPrimitiveGroup(fields: Field[]): FieldPrimitiveGroup {
  const appearance = new Cesium.PerInstanceColorAppearance({
    flat: true,
    translucent: true,
  });
  const classificationType = getFieldClassificationType();

  const primitives = createNonOverlappingFieldBatches(fields).map(batch =>
    new Cesium.GroundPrimitive({
      geometryInstances: batch.map(field => createFieldGeometryInstance(field)),
      appearance,
      allowPicking: false,
      asynchronous: true,
      classificationType,
    })
  );

  return new FieldPrimitiveGroup(primitives);
}

function createNonOverlappingFieldBatches(fields: Field[]): Field[][] {
  // A classification primitive shades overlapping instances only once, so true overlaps need separate draw passes.
  const sortedFields = [...fields].sort((first, second) =>
    second.sphericalArea - first.sphericalArea || first.data.guid.localeCompare(second.data.guid)
  );
  const batches: Field[][] = [];

  sortedFields.forEach((field) => {
    const availableBatch = batches.find(batch =>
      batch.every(existing => !doSphericalTrianglesOverlap(field.unitPositions, existing.unitPositions))
    );

    if (availableBatch) {
      availableBatch.push(field);
    } else {
      batches.push([field]);
    }
  });

  return batches;
}

function createFieldPositions(data: FieldData): Cesium.Cartesian3[] {
  return data.points.map(point => Cesium.Cartesian3.fromDegrees(point.lngE6 / 1e6, point.latE6 / 1e6));
}

function createFieldUnitPositions(data: FieldData): Cesium.Cartesian3[] {
  return data.points.map((point) => {
    const longitude = Cesium.Math.toRadians(point.lngE6 / 1e6);
    const latitude = Cesium.Math.toRadians(point.latE6 / 1e6);
    const cosLatitude = Math.cos(latitude);
    return new Cesium.Cartesian3(
      cosLatitude * Math.cos(longitude),
      cosLatitude * Math.sin(longitude),
      Math.sin(latitude),
    );
  });
}

function getSphericalTriangleArea(positions: Cesium.Cartesian3[]): number {
  if (positions.length !== 3) return 0;

  const [first, second, third] = positions;
  const determinant = dot(first, cross(second, third));
  const denominator = 1 + dot(first, second) + dot(second, third) + dot(third, first);
  return 2 * Math.atan2(Math.abs(determinant), denominator);
}

function doSphericalTrianglesOverlap(
  first: Cesium.Cartesian3[],
  second: Cesium.Cartesian3[],
): boolean {
  if (first.length !== 3 || second.length !== 3) return true;
  if (haveSameVertices(first, second)) return true;

  if (first.some(position => isStrictlyInsideSphericalTriangle(position, second))) return true;
  if (second.some(position => isStrictlyInsideSphericalTriangle(position, first))) return true;

  for (let firstIndex = 0; firstIndex < 3; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % 3];
    for (let secondIndex = 0; secondIndex < 3; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % 3];
      if (doGreatCircleArcsProperlyIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }

  return false;
}

const SPHERICAL_GEOMETRY_EPSILON = 1e-12;

function haveSameVertices(first: Cesium.Cartesian3[], second: Cesium.Cartesian3[]): boolean {
  return first.every(firstPosition =>
    second.some(secondPosition => isSamePosition(firstPosition, secondPosition))
  );
}

function isSamePosition(first: Cesium.Cartesian3, second: Cesium.Cartesian3): boolean {
  return dot(first, second) >= 1 - SPHERICAL_GEOMETRY_EPSILON;
}

function isStrictlyInsideSphericalTriangle(
  position: Cesium.Cartesian3,
  triangle: Cesium.Cartesian3[],
): boolean {
  for (let index = 0; index < 3; index += 1) {
    const start = triangle[index];
    const end = triangle[(index + 1) % 3];
    const opposite = triangle[(index + 2) % 3];
    const normal = normalizedCross(start, end);
    if (!normal) return false;

    const oppositeSide = dot(normal, opposite);
    const positionSide = dot(normal, position) * Math.sign(oppositeSide);
    if (Math.abs(oppositeSide) <= SPHERICAL_GEOMETRY_EPSILON
      || positionSide <= SPHERICAL_GEOMETRY_EPSILON) return false;
  }

  return true;
}

function doGreatCircleArcsProperlyIntersect(
  firstStart: Cesium.Cartesian3,
  firstEnd: Cesium.Cartesian3,
  secondStart: Cesium.Cartesian3,
  secondEnd: Cesium.Cartesian3,
): boolean {
  if (isSamePosition(firstStart, secondStart)
    || isSamePosition(firstStart, secondEnd)
    || isSamePosition(firstEnd, secondStart)
    || isSamePosition(firstEnd, secondEnd)) return false;

  const firstNormal = normalizedCross(firstStart, firstEnd);
  const secondNormal = normalizedCross(secondStart, secondEnd);
  if (!firstNormal || !secondNormal) return false;

  const intersection = normalizedCross(firstNormal, secondNormal);
  if (!intersection) return false;
  const oppositeIntersection = negate(intersection);

  return isInsideGreatCircleArc(intersection, firstStart, firstEnd, firstNormal)
    && isInsideGreatCircleArc(intersection, secondStart, secondEnd, secondNormal)
    || isInsideGreatCircleArc(oppositeIntersection, firstStart, firstEnd, firstNormal)
    && isInsideGreatCircleArc(oppositeIntersection, secondStart, secondEnd, secondNormal);
}

function isInsideGreatCircleArc(
  position: Cesium.Cartesian3,
  start: Cesium.Cartesian3,
  end: Cesium.Cartesian3,
  normal: Cesium.Cartesian3,
): boolean {
  return dot(cross(start, position), normal) > SPHERICAL_GEOMETRY_EPSILON
    && dot(cross(position, end), normal) > SPHERICAL_GEOMETRY_EPSILON;
}

function normalizedCross(first: Cesium.Cartesian3, second: Cesium.Cartesian3): Cesium.Cartesian3 | undefined {
  const result = cross(first, second);
  const magnitude = Math.hypot(result.x, result.y, result.z);
  if (magnitude <= SPHERICAL_GEOMETRY_EPSILON) return undefined;

  result.x /= magnitude;
  result.y /= magnitude;
  result.z /= magnitude;
  return result;
}

function cross(first: Cesium.Cartesian3, second: Cesium.Cartesian3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x,
  );
}

function dot(first: Cesium.Cartesian3, second: Cesium.Cartesian3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function negate(position: Cesium.Cartesian3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(-position.x, -position.y, -position.z);
}

interface UpdatableGroundPrimitive {
  update(frameState: unknown): void;
}

class FieldPrimitiveGroup {
  public show = true;
  private isDestroyedValue = false;

  constructor(private readonly primitives: Cesium.GroundPrimitive[]) {}

  public get ready(): boolean {
    return this.primitives.every(primitive => primitive.ready);
  }

  public update(frameState: unknown): void {
    this.primitives.forEach((primitive) => {
      primitive.show = this.show;
      (primitive as unknown as UpdatableGroundPrimitive).update(frameState);
    });
  }

  public isDestroyed(): boolean {
    return this.isDestroyedValue;
  }

  public destroy(): void {
    if (this.isDestroyedValue) return;
    this.isDestroyedValue = true;
    this.primitives.forEach(primitive => primitive.destroy());
  }
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
