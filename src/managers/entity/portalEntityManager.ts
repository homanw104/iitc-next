/**
 * Manage portal entities.
 */

import * as Cesium from "cesium";
import { intelApiClient } from "../../utils/api.ts";
import type { FieldData, LinkData, PortalData } from "../../types/ingress";
import { getTeamColor } from "../../utils/color";
import type { LayerManager } from "../layer/layerManager";
import { settingsManager } from "../system/settingsManager.ts";
import { parsePortal } from "../tiles/tileRequestEntityParser";
import type { EntityPositionManager, EntityPositionCallback } from "./entityPositionManager";
import type { EntityTranslucencyManager } from "./entityTranslucencyManager";
import { getPortalEntityLayerId } from "./portalEntityLayers";

export const PORTAL_POINT_PIXEL_SIZE = 18;
export const PORTAL_POINT_OUTLINE_WIDTH = 2;
export const PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE = 1e4;
export const PORTAL_OCCLUDED_ALPHA = 0.5;

const PORTAL_NEAR_FAR_SCALAR_NEAR = 1e1;
const PORTAL_NEAR_FAR_SCALAR_NEAR_VALUE = 1;
const PORTAL_NEAR_FAR_SCALAR_FAR = 1e4;
const PORTAL_NEAR_FAR_SCALAR_FAR_VALUE = 0.125;
const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_DEFAULT = 3e3;
const PORTAL_DISABLE_DEPTH_TEST_DISTANCE_GOOGLE = 0;

interface Portal {
  data: PortalData;
  entity: Cesium.Entity;
  occlusionEntity: Cesium.Entity;
  positionCallback: EntityPositionCallback;
  currentLayerId: string;
  pendingLayerId?: string;
}

export class PortalEntityManager {
  private portals: Map<string, Portal> = new Map();
  private portalsPendingCreation: Set<string> = new Set();
  private selectedPortalGuid?: string;
  private layerMovePostponedPortalGuids: Set<string> = new Set();

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    private entityTranslucencyManager: EntityTranslucencyManager
  ) {
    this.viewer.selectedEntityChanged.addEventListener((selectedEntity) => {
      const selectedPortalGuid = this.getSelectablePortalGuid(selectedEntity);
      if (this.selectedPortalGuid && this.selectedPortalGuid !== selectedPortalGuid) {
        this.layerMovePostponedPortalGuids.delete(this.selectedPortalGuid);
        this.flushPendingLayerMove(this.selectedPortalGuid);
      }
      this.selectedPortalGuid = selectedPortalGuid;
    });
  }

  public async requestPortalDetails(guid: string): Promise<void> {
    const data = await intelApiClient.getPortalDetails(guid);
    const portalData = parsePortal([guid, data.result[13] as number, data.result]);
    await this.addOrUpdatePortal(portalData);
  }

  public async addOrUpdatePortals(portals: PortalData[]): Promise<void> {
    const layers = new Set<string>();
    portals.forEach((portal) => {
      const existing = this.portals.get(portal.guid);
      if (existing) layers.add(existing.currentLayerId);
      layers.add(getPortalEntityLayerId(portal));
    });

    await this.layerManager.withEntityCollectionEventsSuspended(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      async () => {
        await Promise.all(portals.map((portal) => this.addOrUpdatePortal(portal)));
      }
    );
  }

  public async addOrUpdatePortal(data: PortalData): Promise<void> {
    const existing = this.portals.get(data.guid);
    if (existing) {
      await this.updateExistingPortal(existing, data);
      return;
    } else {
      await this.createAndStorePortal(data);
    }
  }

  public postponeLayerMove(guid: string): void {
    this.layerMovePostponedPortalGuids.add(guid);
  }

  public releasePostponedLayerMove(guid: string): void {
    this.layerMovePostponedPortalGuids.delete(guid);
    const portalInfo = this.portals.get(guid);
    if (!portalInfo || this.viewer.selectedEntity === portalInfo.entity) return;

    this.flushPendingLayerMove(guid);
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portals.get(guid)?.data;
  }

  public addPortalLink(guid: string, link: LinkData): boolean {
    const portal = this.getPortalData(guid);
    if (!portal) return false;
    if (portal.links?.some((existingLink) => existingLink.guid === link.guid)) return true;

    (portal.links ??= []).push(link);
    return true;
  }

  public addPortalField(guid: string, field: FieldData): boolean {
    const portal = this.getPortalData(guid);
    if (!portal) return false;
    if (portal.fields?.some((existingField) => existingField.guid === field.guid)) return true;

    (portal.fields ??= []).push(field);
    return true;
  }

  public getPortalDataByCoordinates(latE6: number, lngE6: number): PortalData | undefined {
    return Array.from(this.portals.values()).find(({ data }) =>
      data.latE6 === latE6 && data.lngE6 === lngE6
    )?.data;
  }

  public getPortalEntity(guid: string): Cesium.Entity | undefined {
    return this.portals.get(guid)?.entity;
  }

  public removePortalsInView(viewRect: Cesium.Rectangle): void {
    this.removePortalEntitiesInView(viewRect);
  }

  private async updateExistingPortal(portal: Portal, data: PortalData): Promise<void> {
    if (!shouldReplacePortalData(portal.data, data)) return;

    this.syncPortalLayer(portal, data);
    await this.updatePortalEntity(portal.entity, portal.occlusionEntity, data);
    this.updatePortalPositionSubscription(portal, data);
    portal.data = data;
  }

  private async createAndStorePortal(data: PortalData): Promise<void> {
    if (this.portalsPendingCreation.has(data.guid)) return;

    this.portalsPendingCreation.add(data.guid);
    try {
      const { entity, occlusionEntity } = await this.createPortalEntity(data);
      const positionCallback = createPortalPositionCallback(entity, occlusionEntity);
      this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, positionCallback);
      this.portals.set(data.guid, {
        data,
        entity,
        occlusionEntity,
        positionCallback,
        currentLayerId: getPortalEntityLayerId(data),
      });
    } finally {
      this.portalsPendingCreation.delete(data.guid);
    }
  }

  private async createPortalEntity(data: PortalData): Promise<{
    entity: Cesium.Entity;
    occlusionEntity: Cesium.Entity
  }> {
    const layerId = getPortalEntityLayerId(data);
    const entities = this.layerManager.getOrCreateDataSource(layerId).entities;
    const position = await this.entityPositionManager.getPosition(data);

    const entity = entities.add({
      id: `portal-${data.guid}`,
      position: position,
      point: {
        pixelSize: PORTAL_POINT_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: getPortalDisableDepthTestDistance(),
        scaleByDistance: createPortalNearFarScalar(),
        color: getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
      },
      properties: {
        selectable: true,
      },
    });

    const occlusionEntity = entities.add({
      id: `portal-${data.guid}-occluded`,
      position: position,
      point: {
        pixelSize: PORTAL_POINT_PIXEL_SIZE,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
        scaleByDistance: createPortalNearFarScalar(),
        translucencyByDistance: this.entityTranslucencyManager.getCallbackProperty(),
        color: getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineColor: Cesium.Color.BLACK.withAlpha(PORTAL_OCCLUDED_ALPHA),
        outlineWidth: PORTAL_POINT_OUTLINE_WIDTH,
      },
    });

    return { entity, occlusionEntity };
  }

  private async updatePortalEntity(entity: Cesium.Entity, occlusionEntity: Cesium.Entity, data: PortalData): Promise<void> {
    const position = await this.entityPositionManager.getPosition(data);
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);

    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team));
    }
    if (occlusionEntity.point) {
      occlusionEntity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team).withAlpha(PORTAL_OCCLUDED_ALPHA));
    }
  }

  private updatePortalPositionSubscription(portalInfo: {
    data: PortalData;
    positionCallback: EntityPositionCallback;
  }, data: PortalData): void {
    if (portalInfo.data.latE6 === data.latE6 && portalInfo.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalInfo.data, portalInfo.positionCallback);
    this.entityPositionManager.setOnCoordinatePositionChangedCallback(data, portalInfo.positionCallback);
  }

  private removePortalEntity(guid: string): void {
    const portalInfo = this.portals.get(guid);
    if (portalInfo) {
      const layerId = portalInfo.currentLayerId;
      const entities = this.layerManager.getOrCreateDataSource(layerId).entities;

      entities.remove(portalInfo.entity);
      entities.remove(portalInfo.occlusionEntity);

      this.entityPositionManager.unsetOnCoordinatePositionChangedCallback(portalInfo.data, portalInfo.positionCallback);
      this.portals.delete(guid);
    }
    this.portalsPendingCreation.delete(guid);
  }

  private removePortalEntitiesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    const layers = new Set<string>();
    this.portals.forEach((info, guid) => {
      const position = info.entity.position?.getValue(Cesium.JulianDate.now());
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
          layers.add(info.currentLayerId);
        }
      }
    });
    if (toRemove.length === 0) return;

    this.layerManager.withEntityCollectionEventsSuspendedSync(
      Array.from(layers, (name) => ({ name, type: "dataSource" as const })),
      () => toRemove.forEach(guid => this.removePortalEntity(guid))
    );
  }

  private getSelectablePortalGuid(entity: Cesium.Entity | undefined): string | undefined {
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
      this.layerMovePostponedPortalGuids.has(guid);
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

    this.layerManager.getOrCreateDataSource(portalInfo.currentLayerId).entities.remove(portalInfo.entity);
    this.layerManager.getOrCreateDataSource(portalInfo.currentLayerId).entities.remove(portalInfo.occlusionEntity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(portalInfo.entity);
    this.layerManager.getOrCreateDataSource(newLayerId).entities.add(portalInfo.occlusionEntity);
    portalInfo.currentLayerId = newLayerId;
  }
}

function shouldReplacePortalData(current: PortalData, next: PortalData): boolean {
  if (next.isPlaceholder) return false;

  return current.isPlaceholder === true ||
    (!!next.timestamp && next.timestamp >= (current.timestamp ?? 0));
}

function createPortalPositionCallback(
  entity: Cesium.Entity,
  occlusionEntity: Cesium.Entity,
): EntityPositionCallback {
  return (_latE6, _lngE6, position) => {
    entity.position = new Cesium.ConstantPositionProperty(position);
    occlusionEntity.position = new Cesium.ConstantPositionProperty(position);
  };
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
