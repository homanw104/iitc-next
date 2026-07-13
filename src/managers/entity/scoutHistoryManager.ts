/**
 * Manages scout control halo point primitives.
 */

import * as Cesium from "cesium";
import type { PortalData } from "../../types/iitc/portal";
import type { LayerManager } from "../layer/layerManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  PORTAL_POINT_PIXEL_SIZE,
  PORTAL_POINT_OUTLINE_WIDTH,
  createPortalNearFarScalar,
  createPortalPrimitiveId,
  getPortalDisableDepthTestDistance,
  type PortalPrimitiveId,
} from "./portalManager";

const SCOUT_HISTORY_LAYER_ID = "history-scout-control";
const SCOUT_HISTORY_REVERSE_LAYER_ID = "history-scout-control-reverse";
const HALO_POINT_PIXEL_SIZE = PORTAL_POINT_PIXEL_SIZE + PORTAL_POINT_OUTLINE_WIDTH + 5;
const HALO_POINT_OUTLINE_WIDTH = 5;
const HALO_POINT_ALPHA = 1.0;
const SCOUT_CONTROL_COLOR = "#FF9000";

type ScoutHistoryState = "none" | "controlled";

interface ScoutHistoryHalo {
  data: PortalData;
  primitiveId: PortalPrimitiveId;
  pointPrimitive: Cesium.PointPrimitive | undefined;
  occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
  reversePointPrimitive: Cesium.PointPrimitive | undefined;
  reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;
  positionCallback: EntityPositionCallback;
}

export class ScoutHistoryManager {
  private readonly scoutHistoryHalos: Map<string, ScoutHistoryHalo> = new Map();
  private readonly scoutHistoryHalosPendingCreation: Set<string> = new Set();
  private readonly currentTranslucencyByDistance = new Cesium.NearFarScalar();
  private readonly translucencyByDistanceCallback: TranslucencyByDistanceCallback;

  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly layerManager: LayerManager,
    private readonly entityPositionManager: EntityPositionManager,
    entityTranslucencyManager: EntityTranslucencyManager,
  ) {
    this.translucencyByDistanceCallback = (translucencyByDistance) => {
      Cesium.NearFarScalar.clone(translucencyByDistance, this.currentTranslucencyByDistance);
      this.scoutHistoryHalos.forEach((scoutHistoryHalo) => {
        if (scoutHistoryHalo.occlusionPointPrimitive) {
          scoutHistoryHalo.occlusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
        if (scoutHistoryHalo.reverseOcclusionPointPrimitive) {
          scoutHistoryHalo.reverseOcclusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
      });
      if (this.scoutHistoryHalos.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateScoutControlHalos(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateScoutControlHalo(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateScoutControlHalo(data: PortalData): Promise<void> {
    const existing = this.scoutHistoryHalos.get(data.guid);
    if (existing) {
      await this.updateScoutControlHaloPrimitives(existing, data);
      this.updateScoutHistoryHaloPositionSubscription(existing, data);
      existing.data = data;
    } else {
      await this.createAndStoreScoutControlHalo(data);
    }
    this.viewer.scene.requestRender();
  }

  public removeScoutControlHalo(guid: string): void {
    if (this.removeScoutControlHaloPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeScoutControlHalosInView(viewRect: Cesium.Rectangle): void {
    this.removeScoutControlHaloPrimitivesInView(viewRect);
  }

  private async createAndStoreScoutControlHalo(data: PortalData): Promise<void> {
    if (this.scoutHistoryHalosPendingCreation.has(data.guid)) return;

    this.scoutHistoryHalosPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const {
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
      } = await this.createScoutControlHaloPrimitives(data, primitiveId);

      const scoutHistoryHalo: ScoutHistoryHalo = {
        data,
        primitiveId,
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
        positionCallback: (entityPosition: EntityPosition) => {
          applyScoutControlHaloPosition(scoutHistoryHalo, entityPosition);
        },
      };
      this.entityPositionManager.addPositionChangedCallback(data, scoutHistoryHalo.positionCallback);
      this.scoutHistoryHalos.set(data.guid, scoutHistoryHalo);
    } finally {
      this.scoutHistoryHalosPendingCreation.delete(data.guid);
    }
  }

  private async createScoutControlHaloPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    pointPrimitive: Cesium.PointPrimitive | undefined;
    occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
    reversePointPrimitive: Cesium.PointPrimitive | undefined;
    reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;
  }> {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(SCOUT_HISTORY_LAYER_ID).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(SCOUT_HISTORY_REVERSE_LAYER_ID).pointPrimitives;
    const scoutHistoryState = getScoutHistoryState(data);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    let pointPrimitive: Cesium.PointPrimitive | undefined;
    let occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
    let reversePointPrimitive: Cesium.PointPrimitive | undefined;
    let reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;

    if (scoutHistoryState === "controlled") {
      pointPrimitive = addScoutControlHaloPointPrimitive(
        pointPrimitives,
        primitiveId,
        entityPosition,
      );
      occlusionPointPrimitive = addScoutControlHaloOcclusionPointPrimitive(
        pointPrimitives,
        primitiveId,
        entityPosition,
        this.currentTranslucencyByDistance,
      );
    } else {
      reversePointPrimitive = addScoutControlHaloPointPrimitive(
        reversePointPrimitives,
        primitiveId,
        entityPosition,
      );
      reverseOcclusionPointPrimitive = addScoutControlHaloOcclusionPointPrimitive(
        reversePointPrimitives,
        primitiveId,
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
    } = await this.createScoutControlHaloPrimitives(data, scoutHistoryHalo.primitiveId);
    scoutHistoryHalo.pointPrimitive = pointPrimitive;
    scoutHistoryHalo.occlusionPointPrimitive = occlusionPointPrimitive;
    scoutHistoryHalo.reversePointPrimitive = reversePointPrimitive;
    scoutHistoryHalo.reverseOcclusionPointPrimitive = reverseOcclusionPointPrimitive;
  }

  private updateScoutHistoryHaloPositionSubscription(scoutHistoryHalo: ScoutHistoryHalo, data: PortalData): void {
    this.entityPositionManager.removePositionChangedCallback(scoutHistoryHalo.data, scoutHistoryHalo.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, scoutHistoryHalo.positionCallback);
  }

  private removeScoutControlHaloPrimitive(guid: string): boolean {
    const scoutHistoryHalo = this.scoutHistoryHalos.get(guid);
    if (!scoutHistoryHalo) {
      this.scoutHistoryHalosPendingCreation.delete(guid);
      return false;
    }

    this.removeScoutControlHaloPrimitiveGroup(scoutHistoryHalo);
    this.entityPositionManager.removePositionChangedCallback(scoutHistoryHalo.data, scoutHistoryHalo.positionCallback);
    this.scoutHistoryHalos.delete(guid);
    this.scoutHistoryHalosPendingCreation.delete(guid);
    return true;
  }

  private removeScoutControlHaloPrimitiveGroup(scoutHistoryHalo: ScoutHistoryHalo): void {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(SCOUT_HISTORY_LAYER_ID).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(SCOUT_HISTORY_REVERSE_LAYER_ID).pointPrimitives;

    if (scoutHistoryHalo.pointPrimitive) pointPrimitives.remove(scoutHistoryHalo.pointPrimitive);
    if (scoutHistoryHalo.occlusionPointPrimitive) pointPrimitives.remove(scoutHistoryHalo.occlusionPointPrimitive);
    if (scoutHistoryHalo.reversePointPrimitive) reversePointPrimitives.remove(scoutHistoryHalo.reversePointPrimitive);
    if (scoutHistoryHalo.reverseOcclusionPointPrimitive) reversePointPrimitives.remove(scoutHistoryHalo.reverseOcclusionPointPrimitive);

    scoutHistoryHalo.pointPrimitive = undefined;
    scoutHistoryHalo.occlusionPointPrimitive = undefined;
    scoutHistoryHalo.reversePointPrimitive = undefined;
    scoutHistoryHalo.reverseOcclusionPointPrimitive = undefined;
  }

  private removeScoutControlHaloPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.scoutHistoryHalos.forEach((info, guid) => {
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

    toRemove.forEach((guid) => this.removeScoutControlHaloPrimitive(guid));
    this.viewer.scene.requestRender();
  }
}

function applyScoutControlHaloPosition(
  scoutHistoryHalo: ScoutHistoryHalo,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;

  if (scoutHistoryHalo.pointPrimitive) {
    scoutHistoryHalo.pointPrimitive.position = entityPosition.position;
    scoutHistoryHalo.pointPrimitive.show = show;
  }
  if (scoutHistoryHalo.occlusionPointPrimitive) {
    scoutHistoryHalo.occlusionPointPrimitive.position = entityPosition.position;
    scoutHistoryHalo.occlusionPointPrimitive.show = show;
  }
  if (scoutHistoryHalo.reversePointPrimitive) {
    scoutHistoryHalo.reversePointPrimitive.position = entityPosition.position;
    scoutHistoryHalo.reversePointPrimitive.show = show;
  }
  if (scoutHistoryHalo.reverseOcclusionPointPrimitive) {
    scoutHistoryHalo.reverseOcclusionPointPrimitive.position = entityPosition.position;
    scoutHistoryHalo.reverseOcclusionPointPrimitive.show = show;
  }
}

function addScoutControlHaloPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
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
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
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
  else return "none";
}
