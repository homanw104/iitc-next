/**
 * Manage scout control halo point primitives.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal.ts";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  PORTAL_POINT_PIXEL_SIZE,
  PORTAL_POINT_OUTLINE_WIDTH,
  createPortalNearFarScalar,
  getPortalDisableDepthTestDistance,
} from "./portalEntityManager.ts";

const PRIMITIVE_LAYER_NAME = "history-scout-control";
const PRIMITIVE_LAYER_NAME_REVERSE = "history-scout-control-reverse";
const HALO_POINT_PIXEL_SIZE = PORTAL_POINT_PIXEL_SIZE + PORTAL_POINT_OUTLINE_WIDTH;
const HALO_POINT_OUTLINE_WIDTH = 4;
const HALO_POINT_ALPHA = 1.0;
const SCOUT_CONTROL_COLOR = "#FF9000";

type ScoutHistoryState = "none" | "controlled";

interface ScoutHistoryHalo {
  data: PortalData;
  pointPrimitive?: Cesium.PointPrimitive;
  occlusionPointPrimitive?: Cesium.PointPrimitive;
  reversePointPrimitive?: Cesium.PointPrimitive;
  reverseOcclusionPointPrimitive?: Cesium.PointPrimitive;
  positionCallback: EntityPositionCallback;
}

export class ScoutHistoryEntityManager {
  private scoutControlHalos: Map<string, ScoutHistoryHalo> = new Map();
  private scoutControlHalosPendingCreation: Set<string> = new Set();
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private viewer: Cesium.Viewer,
    private layerManager: LayerManager,
    private entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.scoutControlHalos.forEach((scoutControlHalo) => {
        if (scoutControlHalo.occlusionPointPrimitive) {
          scoutControlHalo.occlusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
        if (scoutControlHalo.reverseOcclusionPointPrimitive) {
          scoutControlHalo.reverseOcclusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
      });
      if (this.scoutControlHalos.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.setOnTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateScoutControlHalos(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateScoutControlHaloPrimitive(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateScoutControlHalo(data: PortalData): Promise<void> {
    await this.addOrUpdateScoutControlHaloPrimitive(data);
    this.viewer.scene.requestRender();
  }

  public removeScoutControlHalo(guid: string): void {
    if (this.removeScoutControlHaloPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeScoutControlHalosInView(viewRect: Cesium.Rectangle): void {
    this.removeScoutControlHaloPrimitivesInView(viewRect);
  }

  private async addOrUpdateScoutControlHaloPrimitive(data: PortalData): Promise<void> {
    const existing = this.scoutControlHalos.get(data.guid);
    if (existing) {
      await this.updateScoutControlHaloPrimitives(existing, data);
      this.updateScoutControlPositionSubscription(existing, data);
      existing.data = data;
    } else {
      await this.createAndStoreScoutControlHalo(data);
    }
  }

  private async createAndStoreScoutControlHalo(data: PortalData): Promise<void> {
    if (this.scoutControlHalosPendingCreation.has(data.guid)) return;

    this.scoutControlHalosPendingCreation.add(data.guid);
    try {
      const {
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
      } = await this.createScoutControlHaloPrimitives(data);

      const scoutHistoryHalo: ScoutHistoryHalo = {
        data,
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
        positionCallback: (entityPosition: EntityPosition) => {
          applyScoutControlHaloPosition(scoutHistoryHalo, entityPosition);
        },
      };
      this.entityPositionManager.setOnPositionChangedCallback(data, scoutHistoryHalo.positionCallback);
      this.scoutControlHalos.set(data.guid, scoutHistoryHalo);
    } finally {
      this.scoutControlHalosPendingCreation.delete(data.guid);
    }
  }

  private async createScoutControlHaloPrimitives(data: PortalData): Promise<{
    pointPrimitive: Cesium.PointPrimitive | undefined;
    occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
    reversePointPrimitive: Cesium.PointPrimitive | undefined;
    reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;
  }> {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PRIMITIVE_LAYER_NAME).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PRIMITIVE_LAYER_NAME_REVERSE).pointPrimitives;
    const scoutHistoryState = getScoutHistoryState(data);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    let pointPrimitive: Cesium.PointPrimitive | undefined = undefined;
    let occlusionPointPrimitive: Cesium.PointPrimitive | undefined = undefined;
    let reversePointPrimitive: Cesium.PointPrimitive | undefined = undefined;
    let reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined = undefined;

    if (scoutHistoryState === "controlled") {
      pointPrimitive = addScoutControlHaloPointPrimitive(
        pointPrimitives,
        `scout-halo-${data.guid}`,
        entityPosition,
      );
      occlusionPointPrimitive = addScoutControlHaloOcclusionPointPrimitive(
        pointPrimitives,
        `scout-halo-occluded-${data.guid}`,
        entityPosition,
        this.currentTranslucencyByDistance,
      );
    } else {
      reversePointPrimitive = addScoutControlHaloPointPrimitive(
        reversePointPrimitives,
        `scout-halo-reverse-${data.guid}`,
        entityPosition,
      );
      reverseOcclusionPointPrimitive = addScoutControlHaloOcclusionPointPrimitive(
        reversePointPrimitives,
        `scout-halo-reverse-occluded-${data.guid}`,
        entityPosition,
        this.currentTranslucencyByDistance,
      );
    }

    return { pointPrimitive, occlusionPointPrimitive, reversePointPrimitive, reverseOcclusionPointPrimitive };
  }

  private async updateScoutControlHaloPrimitives(scoutHistoryHalo: ScoutHistoryHalo, data: PortalData): Promise<void> {
    this.removeScoutControlHaloPrimitiveGroup(scoutHistoryHalo);
    const {
      pointPrimitive,
      occlusionPointPrimitive,
      reversePointPrimitive,
      reverseOcclusionPointPrimitive,
    } = await this.createScoutControlHaloPrimitives(data);
    scoutHistoryHalo.pointPrimitive = pointPrimitive;
    scoutHistoryHalo.occlusionPointPrimitive = occlusionPointPrimitive;
    scoutHistoryHalo.reversePointPrimitive = reversePointPrimitive;
    scoutHistoryHalo.reverseOcclusionPointPrimitive = reverseOcclusionPointPrimitive;
  }

  private updateScoutControlPositionSubscription(scoutControlHalo: ScoutHistoryHalo, data: PortalData): void {
    this.entityPositionManager.unsetOnPositionChangedCallback(scoutControlHalo.data, scoutControlHalo.positionCallback);
    this.entityPositionManager.setOnPositionChangedCallback(data, scoutControlHalo.positionCallback);
  }

  private removeScoutControlHaloPrimitive(guid: string): boolean {
    const scoutControlHalo = this.scoutControlHalos.get(guid);
    if (!scoutControlHalo) {
      this.scoutControlHalosPendingCreation.delete(guid);
      return false;
    }

    this.removeScoutControlHaloPrimitiveGroup(scoutControlHalo);
    this.entityPositionManager.unsetOnPositionChangedCallback(scoutControlHalo.data, scoutControlHalo.positionCallback);
    this.scoutControlHalos.delete(guid);
    this.scoutControlHalosPendingCreation.delete(guid);
    return true;
  }

  private removeScoutControlHaloPrimitiveGroup(scoutControlHalo: ScoutHistoryHalo): void {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PRIMITIVE_LAYER_NAME).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PRIMITIVE_LAYER_NAME_REVERSE).pointPrimitives;

    if (scoutControlHalo.pointPrimitive) pointPrimitives.remove(scoutControlHalo.pointPrimitive);
    if (scoutControlHalo.occlusionPointPrimitive) pointPrimitives.remove(scoutControlHalo.occlusionPointPrimitive);
    if (scoutControlHalo.reversePointPrimitive) reversePointPrimitives.remove(scoutControlHalo.reversePointPrimitive);
    if (scoutControlHalo.reverseOcclusionPointPrimitive) reversePointPrimitives.remove(scoutControlHalo.reverseOcclusionPointPrimitive);

    scoutControlHalo.pointPrimitive = undefined;
    scoutControlHalo.occlusionPointPrimitive = undefined;
    scoutControlHalo.reversePointPrimitive = undefined;
    scoutControlHalo.reverseOcclusionPointPrimitive = undefined;
  }

  private removeScoutControlHaloPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.scoutControlHalos.forEach((info, guid) => {
      const position = info.pointPrimitive?.position
        ?? info.occlusionPointPrimitive?.position
        ?? info.reversePointPrimitive?.position
        ?? info.reverseOcclusionPointPrimitive?.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    if (toRemove.length === 0) return;

    toRemove.forEach(guid => this.removeScoutControlHaloPrimitive(guid));
    this.viewer.scene.requestRender();
  }
}

function applyScoutControlHaloPosition(
  scoutControlHalo: ScoutHistoryHalo,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;

  if (scoutControlHalo.pointPrimitive) {
    scoutControlHalo.pointPrimitive.position = entityPosition.position;
    scoutControlHalo.pointPrimitive.show = show;
  }
  if (scoutControlHalo.occlusionPointPrimitive) {
    scoutControlHalo.occlusionPointPrimitive.position = entityPosition.position;
    scoutControlHalo.occlusionPointPrimitive.show = show;
  }
  if (scoutControlHalo.reversePointPrimitive) {
    scoutControlHalo.reversePointPrimitive.position = entityPosition.position;
    scoutControlHalo.reversePointPrimitive.show = show;
  }
  if (scoutControlHalo.reverseOcclusionPointPrimitive) {
    scoutControlHalo.reverseOcclusionPointPrimitive.position = entityPosition.position;
    scoutControlHalo.reverseOcclusionPointPrimitive.show = show;
  }
}

function addScoutControlHaloPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  id: string,
  entityPosition: EntityPosition,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize: HALO_POINT_PIXEL_SIZE,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(HALO_POINT_ALPHA),
    outlineWidth: HALO_POINT_OUTLINE_WIDTH,
    scaleByDistance: createPortalNearFarScalar(),
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
  });
}

function addScoutControlHaloOcclusionPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  id: string,
  entityPosition: EntityPosition,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize: HALO_POINT_PIXEL_SIZE,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: Cesium.Color.fromCssColorString(SCOUT_CONTROL_COLOR).withAlpha(PORTAL_OCCLUDED_ALPHA),
    outlineWidth: HALO_POINT_OUTLINE_WIDTH,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  });
}

function getScoutHistoryState(data: PortalData): ScoutHistoryState {
  if (data.history?.scoutControlled) return "controlled";
  return "none";
}
