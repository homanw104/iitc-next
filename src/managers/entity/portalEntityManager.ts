/**
 * Manage portal entities, point primitives, and their associated data.
 */

import * as Cesium from "cesium";
import type { FieldData } from "../../types/iitc/field.ts";
import type { LinkData } from "../../types/iitc/link.ts";
import type { PortalData } from "../../types/iitc/portal.ts";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import { apiRequestManager } from "../system/apiRequestManager.ts";
import { settingsManager } from "../system/settingsManager.ts";
import { parsePortal } from "../tiles/tileRequestEntityParser";
import type { EntityPositionManager, EntityPositionCallback, EntityPosition } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import { getPortalEntityLayerId } from "./portalEntityLayers";

export const PORTAL_POINT_PIXEL_SIZE = 18;
export const PORTAL_POINT_OUTLINE_WIDTH = 2;
export const PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE = 1e4;
export const PORTAL_OCCLUDED_ALPHA = 0.5;

export interface PortalPrimitiveId {
  type: "portal";
  guid: string;
}

const PORTAL_NEAR_FAR_SCALAR_NEAR = 1e1;
const PORTAL_NEAR_FAR_SCALAR_NEAR_VALUE = 1;
const PORTAL_NEAR_FAR_SCALAR_FAR = 1e4;
const PORTAL_NEAR_FAR_SCALAR_FAR_VALUE = 0.125;
const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_DEFAULT = 3e3;
const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_GOOGLE = 0;

interface Portal {
  data: PortalData;
  entity: Cesium.Entity;
  primitiveId: PortalPrimitiveId;
  pointPrimitive: Cesium.PointPrimitive;
  occlusionPointPrimitive: Cesium.PointPrimitive;
  positionCallback: EntityPositionCallback;
  currentLayerId: string;
  pendingLayerId?: string;
}

export class PortalEntityManager {
  private portals: Map<string, Portal> = new Map();
  private portalsPendingCreation: Set<string> = new Set();
  private portalsPendingLayerMove: Set<string> = new Set();
  private selectedPortalGuid?: string;
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    private entityTranslucencyManager: EntityTranslucencyManager
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.portals.forEach((portal) => {
        portal.occlusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
      });
      if (this.portals.size > 0) this.viewer.scene.requestRender();
    };
    this.entityTranslucencyManager.setOnTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);

    this.viewer.selectedEntityChanged.addEventListener((selectedEntity) => {
      const selectedPortalGuid = this.getSelectedPortalGuid(selectedEntity);
      if (this.selectedPortalGuid && this.selectedPortalGuid !== selectedPortalGuid) {
        this.portalsPendingLayerMove.delete(this.selectedPortalGuid);
        this.flushPendingLayerMove(this.selectedPortalGuid);
      }
      this.selectedPortalGuid = selectedPortalGuid;
    });
  }

  public async requestPortalDetails(guid: string): Promise<void> {
    const data = await apiRequestManager.getPortalDetails(guid);
    const portalData = parsePortal([guid, data.result[13] as number, data.result]);
    await this.addOrUpdatePortal(portalData);
    this.viewer.scene.requestRender();
  }

  public async addOrUpdatePortals(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdatePortal(portal)));
    this.viewer.scene.requestRender();
  }

  public postponeLayerMove(guid: string): void {
    this.portalsPendingLayerMove.add(guid);
  }

  public releasePostponedLayerMove(guid: string): void {
    this.portalsPendingLayerMove.delete(guid);
    const portalInfo = this.portals.get(guid);
    if (portalInfo && this.viewer.selectedEntity !== portalInfo.entity) {
      this.flushPendingLayerMove(guid);
    }
  }

  public getPortalEntity(guid: string): Cesium.Entity | undefined {
    return this.portals.get(guid)?.entity;
  }

  public getPortalPosition(guid: string): Cesium.Cartesian3 | undefined {
    const position = this.portals.get(guid)?.pointPrimitive.position;
    return position ? Cesium.Cartesian3.clone(position) : undefined;
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portals.get(guid)?.data;
  }

  public getPortalDataByCoordinates(latE6: number, lngE6: number): PortalData | undefined {
    return Array.from(this.portals.values()).find(({ data }) =>
      data.latE6 === latE6 && data.lngE6 === lngE6
    )?.data;
  }

  public forEachPortalData(callback: (data: PortalData) => void): void {
    this.portals.forEach(portal => callback(portal.data));
  }

  public addPortalLink(guid: string, link: LinkData): void {
    const portal = this.getPortalData(guid);
    if (portal && !portal.links?.some((existingLink) => existingLink.guid === link.guid)) {
      (portal.links ??= []).push(link);
    }
  }

  public addPortalField(guid: string, field: FieldData): void {
    const portal = this.getPortalData(guid);
    if (portal && !portal.fields?.some((existingField) => existingField.guid === field.guid)) {
      (portal.fields ??= []).push(field);
    }
  }

  public removePortalsInView(viewRect: Cesium.Rectangle): void {
    this.removePortalEntitiesInView(viewRect);
  }

  private async addOrUpdatePortal(data: PortalData): Promise<void> {
    const existing = this.portals.get(data.guid);
    if (existing) {
      await this.updateExistingPortal(existing, data);
    } else {
      await this.createAndStorePortal(data);
    }
  }

  private async updateExistingPortal(portal: Portal, data: PortalData): Promise<void> {
    if (!shouldReplacePortalData(portal.data, data)) return;

    this.syncPortalLayer(portal, data);
    await this.updatePortalPrimitives(portal, data);
    this.updatePortalPositionSubscription(portal, data);
    portal.data = data;
  }

  private async createAndStorePortal(data: PortalData): Promise<void> {
    if (this.portalsPendingCreation.has(data.guid)) return;

    this.portalsPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const { entity, pointPrimitive, occlusionPointPrimitive } = await this.createPortalPrimitives(data, primitiveId);
      const positionCallback = createPortalPositionCallback(entity, pointPrimitive, occlusionPointPrimitive);
      this.entityPositionManager.setOnPositionChangedCallback(data, positionCallback);
      this.portals.set(data.guid, {
        data,
        entity,
        primitiveId,
        pointPrimitive,
        occlusionPointPrimitive,
        positionCallback,
        currentLayerId: getPortalEntityLayerId(data),
      });
    } finally {
      this.portalsPendingCreation.delete(data.guid);
    }
  }

  private async createPortalPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    entity: Cesium.Entity;
    pointPrimitive: Cesium.PointPrimitive;
    occlusionPointPrimitive: Cesium.PointPrimitive;
  }> {
    const layerId = getPortalEntityLayerId(data);
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(layerId).pointPrimitives;
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    const entity = new Cesium.Entity({
      id: `portal-${data.guid}`,
      position: entityPosition.position,
      show: !entityPosition.isFallbackPosition,
      properties: {
        selectable: true,
      },
    });

    const pointPrimitive = addPortalPointPrimitive(
      pointPrimitives,
      primitiveId,
      entity,
      data
    );

    const occlusionPointPrimitive = addPortalOcclusionPointPrimitive(
      pointPrimitives,
      primitiveId,
      entity,
      data,
      this.currentTranslucencyByDistance,
    );

    return { entity, pointPrimitive, occlusionPointPrimitive };
  }

  private async updatePortalPrimitives(portal: Portal, data: PortalData): Promise<void> {
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);
    applyPortalPosition(portal.entity, portal.pointPrimitive, portal.occlusionPointPrimitive, entityPosition);
    portal.pointPrimitive.color = getTeamColor(data.team);
    portal.occlusionPointPrimitive.color = getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA);
  }

  private updatePortalPositionSubscription(portal: Portal, data: PortalData): void {
    this.entityPositionManager.unsetOnPositionChangedCallback(portal.data, portal.positionCallback);
    this.entityPositionManager.setOnPositionChangedCallback(data, portal.positionCallback);
  }

  private removePortalEntity(guid: string): void {
    const portal = this.portals.get(guid);
    if (portal) {
      const layerId = portal.currentLayerId;
      const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(layerId).pointPrimitives;

      pointPrimitives.remove(portal.pointPrimitive);
      pointPrimitives.remove(portal.occlusionPointPrimitive);

      this.entityPositionManager.unsetOnPositionChangedCallback(portal.data, portal.positionCallback);
      this.portals.delete(guid);
    }
    this.portalsPendingCreation.delete(guid);
  }

  private removePortalEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.portals.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    if (toRemove.length === 0) return;

    toRemove.forEach(guid => this.removePortalEntity(guid));
    this.viewer.scene.requestRender();
  }

  private getSelectedPortalGuid(entity: Cesium.Entity | undefined): string | undefined {
    if (!entity?.id.startsWith("portal-")) return undefined;
    if (!entity.properties?.selectable?.getValue()) return undefined;

    return entity.id.substring(7);
  }

  private flushPendingLayerMove(guid: string): void {
    const portalInfo = this.portals.get(guid);
    if (!portalInfo?.pendingLayerId) return;

    this.movePortalToLayer(portalInfo, portalInfo.pendingLayerId);
    portalInfo.pendingLayerId = undefined;
  }

  private shouldPostponeLayerMove(portalInfo: Portal, guid: string): boolean {
    return this.viewer.selectedEntity === portalInfo.entity ||
      this.portalsPendingLayerMove.has(guid);
  }

  private syncPortalLayer(portal: Portal, data: PortalData): void {
    const newLayerId = getPortalEntityLayerId(data);
    if (portal.currentLayerId === newLayerId) {
      portal.pendingLayerId = undefined;
      return;
    }

    if (this.shouldPostponeLayerMove(portal, data.guid)) {
      portal.pendingLayerId = newLayerId;
      return;
    }

    this.movePortalToLayer(portal, newLayerId);
    portal.pendingLayerId = undefined;
  }

  private movePortalToLayer(portalInfo: Portal, newLayerId: string): void {
    if (portalInfo.currentLayerId === newLayerId) return;

    const oldPointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(portalInfo.currentLayerId).pointPrimitives;
    oldPointPrimitives.remove(portalInfo.pointPrimitive);
    oldPointPrimitives.remove(portalInfo.occlusionPointPrimitive);

    const newPointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(newLayerId).pointPrimitives;

    portalInfo.pointPrimitive = addPortalPointPrimitive(
      newPointPrimitives,
      portalInfo.primitiveId,
      portalInfo.entity,
      portalInfo.data
    );

    portalInfo.occlusionPointPrimitive = addPortalOcclusionPointPrimitive(
      newPointPrimitives,
      portalInfo.primitiveId,
      portalInfo.entity,
      portalInfo.data,
      this.currentTranslucencyByDistance,
    );
    portalInfo.currentLayerId = newLayerId;
  }
}

function shouldReplacePortalData(current: PortalData, next: PortalData): boolean {
  if (next.isPlaceholder) return false;
  return (current.isPlaceholder === true) || (!!next.timestamp && next.timestamp >= (current.timestamp ?? 0));
}

function createPortalPositionCallback(
  entity: Cesium.Entity,
  pointPrimitive: Cesium.PointPrimitive,
  occlusionPointPrimitive: Cesium.PointPrimitive,
): EntityPositionCallback {
  return (entityPosition: EntityPosition) => {
    applyPortalPosition(entity, pointPrimitive, occlusionPointPrimitive, entityPosition);
  };
}

function applyPortalPosition(
  entity: Cesium.Entity,
  pointPrimitive: Cesium.PointPrimitive,
  occlusionPointPrimitive: Cesium.PointPrimitive,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;
  entity.position = new Cesium.ConstantPositionProperty(entityPosition.position);
  entity.show = show;
  pointPrimitive.position = entityPosition.position;
  pointPrimitive.show = show;
  occlusionPointPrimitive.position = entityPosition.position;
  occlusionPointPrimitive.show = show;
}

function addPortalPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entity: Cesium.Entity,
  data: PortalData,
): Cesium.PointPrimitive {
  const position = entity.position?.getValue(Cesium.JulianDate.now()) ?? getFallbackPortalPosition(data);
  return pointPrimitives.add({
    id: primitiveId,
    position,
    show: entity.show,
    pixelSize: PORTAL_POINT_PIXEL_SIZE,
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
    scaleByDistance: createPortalNearFarScalar(),
    color: getTeamColor(data.team),
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
  });
}

function addPortalOcclusionPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entity: Cesium.Entity,
  data: PortalData,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.PointPrimitive {
  const position = entity.position?.getValue(Cesium.JulianDate.now()) ?? getFallbackPortalPosition(data);
  return pointPrimitives.add({
    id: primitiveId,
    position,
    show: entity.show,
    pixelSize: PORTAL_POINT_PIXEL_SIZE,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
    color: getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA),
    outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA),
    outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
  });
}

function getFallbackPortalPosition(data: PortalData): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6, 0);
}

export function getPortalDisableDepthTestDistance(): number {
  return settingsManager.getUseGoogle3dTiles() ?
    PORTAL_DISABLE_DEPTH_TEST_DISTANCE_GOOGLE :
    PORTAL_DISABLE_DEPTH_TEST_DISTANCE_DEFAULT;
}

export function createPortalNearFarScalar(): Cesium.NearFarScalar {
  return new Cesium.NearFarScalar(
    PORTAL_NEAR_FAR_SCALAR_NEAR,
    PORTAL_NEAR_FAR_SCALAR_NEAR_VALUE,
    PORTAL_NEAR_FAR_SCALAR_FAR,
    PORTAL_NEAR_FAR_SCALAR_FAR_VALUE,
  );
}

export function getPortalNearFarScale(distance: number): number {
  if (distance <= PORTAL_NEAR_FAR_SCALAR_NEAR) return PORTAL_NEAR_FAR_SCALAR_NEAR_VALUE;
  if (distance >= PORTAL_NEAR_FAR_SCALAR_FAR) return PORTAL_NEAR_FAR_SCALAR_FAR_VALUE;

  return Cesium.Math.lerp(
    PORTAL_NEAR_FAR_SCALAR_NEAR_VALUE,
    PORTAL_NEAR_FAR_SCALAR_FAR_VALUE,
    (distance - PORTAL_NEAR_FAR_SCALAR_NEAR) / (PORTAL_NEAR_FAR_SCALAR_FAR - PORTAL_NEAR_FAR_SCALAR_NEAR),
  );
}

export function createPortalPrimitiveId(guid: string): PortalPrimitiveId {
  return { type: "portal", guid };
}

export function isPortalPrimitiveId(value: unknown): value is PortalPrimitiveId {
  if (typeof value !== "object" || value === null) return false;

  const id = value as Partial<PortalPrimitiveId>;
  return id.type === "portal" && typeof id.guid === "string";
}
