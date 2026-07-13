/**
 * Manages portal history halo point primitives.
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

const PORTAL_HISTORY_LAYER_ID = "history-visited-captured";
const PORTAL_HISTORY_REVERSE_LAYER_ID = "history-visited-captured-reverse";
const HALO_POINT_PIXEL_SIZE = PORTAL_POINT_PIXEL_SIZE + PORTAL_POINT_OUTLINE_WIDTH + 5;
const HALO_POINT_OUTLINE_WIDTH = 5;
const HALO_POINT_ALPHA = 1.0;
const VISITED_COLOR = "#FFCE00";
const CAPTURED_COLOR = "#FF6060";

type PortalHistoryState = "none" | "visited" | "captured";

interface PortalHistoryHalo {
  data: PortalData;
  primitiveId: PortalPrimitiveId;
  pointPrimitive: Cesium.PointPrimitive | undefined;
  occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
  reversePointPrimitive: Cesium.PointPrimitive | undefined;
  reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;
  positionCallback: EntityPositionCallback;
}

export class PortalHistoryManager {
  private readonly portalHistoryHalos: Map<string, PortalHistoryHalo> = new Map();
  private readonly portalHistoryHalosPendingCreation: Set<string> = new Set();
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
      this.portalHistoryHalos.forEach((portalHistoryHalo) => {
        if (portalHistoryHalo.occlusionPointPrimitive) {
          portalHistoryHalo.occlusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
        if (portalHistoryHalo.reverseOcclusionPointPrimitive) {
          portalHistoryHalo.reverseOcclusionPointPrimitive.translucencyByDistance = this.currentTranslucencyByDistance;
        }
      });
      if (this.portalHistoryHalos.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateHistoryHalos(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateHistoryHalo(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateHistoryHalo(data: PortalData): Promise<void> {
    const existing = this.portalHistoryHalos.get(data.guid);
    if (existing) {
      await this.updateHistoryHaloPrimitives(existing, data);
      this.updatePortalHistoryHaloPositionSubscription(existing, data);
      existing.data = data;
    } else {
      await this.createAndStoreHistoryHalo(data);
    }
    this.viewer.scene.requestRender();
  }

  public removeHistoryHalo(guid: string): void {
    if (this.removeHistoryHaloPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeHistoryHalosInView(viewRect: Cesium.Rectangle): void {
    this.removeHistoryHaloPrimitivesInView(viewRect);
  }

  private async createAndStoreHistoryHalo(data: PortalData): Promise<void> {
    if (this.portalHistoryHalosPendingCreation.has(data.guid)) return;

    this.portalHistoryHalosPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const {
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
      } = await this.createHistoryHaloPrimitives(data, primitiveId);

      const portalHistoryHalo: PortalHistoryHalo = {
        data,
        primitiveId,
        pointPrimitive,
        occlusionPointPrimitive,
        reversePointPrimitive,
        reverseOcclusionPointPrimitive,
        positionCallback: (entityPosition: EntityPosition) => {
          applyHistoryHaloPosition(portalHistoryHalo, entityPosition);
        },
      };
      this.entityPositionManager.addPositionChangedCallback(data, portalHistoryHalo.positionCallback);
      this.portalHistoryHalos.set(data.guid, portalHistoryHalo);
    } finally {
      this.portalHistoryHalosPendingCreation.delete(data.guid);
    }
  }

  private async createHistoryHaloPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    pointPrimitive: Cesium.PointPrimitive | undefined;
    occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
    reversePointPrimitive: Cesium.PointPrimitive | undefined;
    reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;
  }> {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PORTAL_HISTORY_LAYER_ID).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PORTAL_HISTORY_REVERSE_LAYER_ID).pointPrimitives;
    const portalHistoryState = getPortalHistoryState(data);
    const entityPosition = await this.entityPositionManager.getEntityPosition(data);

    let pointPrimitive: Cesium.PointPrimitive | undefined;
    let occlusionPointPrimitive: Cesium.PointPrimitive | undefined;
    let reversePointPrimitive: Cesium.PointPrimitive | undefined;
    let reverseOcclusionPointPrimitive: Cesium.PointPrimitive | undefined;

    if (portalHistoryState === "visited" || portalHistoryState === "captured") {
      const color = portalHistoryState === "visited" ? VISITED_COLOR : CAPTURED_COLOR;
      pointPrimitive = addHistoryHaloPointPrimitive(
        pointPrimitives,
        primitiveId,
        entityPosition,
        color,
        true,
      );
      occlusionPointPrimitive = addHistoryHaloOcclusionPointPrimitive(
        pointPrimitives,
        primitiveId,
        entityPosition,
        color,
        this.currentTranslucencyByDistance,
      );
    }

    if (portalHistoryState === "visited" || portalHistoryState === "none") {
      const color = portalHistoryState === "visited" ? VISITED_COLOR : CAPTURED_COLOR;
      reversePointPrimitive = addHistoryHaloPointPrimitive(
        reversePointPrimitives,
        primitiveId,
        entityPosition,
        color,
        true,
      );
      reverseOcclusionPointPrimitive = addHistoryHaloOcclusionPointPrimitive(
        reversePointPrimitives,
        primitiveId,
        entityPosition,
        color,
        this.currentTranslucencyByDistance,
      );
    }

    return { pointPrimitive, occlusionPointPrimitive, reversePointPrimitive, reverseOcclusionPointPrimitive };
  }

  private async updateHistoryHaloPrimitives(portalHistoryHalo: PortalHistoryHalo, data: PortalData): Promise<void> {
    this.removeHistoryHaloPrimitiveGroup(portalHistoryHalo);
    const {
      pointPrimitive,
      occlusionPointPrimitive,
      reversePointPrimitive,
      reverseOcclusionPointPrimitive,
    } = await this.createHistoryHaloPrimitives(data, portalHistoryHalo.primitiveId);
    portalHistoryHalo.pointPrimitive = pointPrimitive;
    portalHistoryHalo.occlusionPointPrimitive = occlusionPointPrimitive;
    portalHistoryHalo.reversePointPrimitive = reversePointPrimitive;
    portalHistoryHalo.reverseOcclusionPointPrimitive = reverseOcclusionPointPrimitive;
  }

  private updatePortalHistoryHaloPositionSubscription(portalHistoryHalo: PortalHistoryHalo, data: PortalData): void {
    this.entityPositionManager.removePositionChangedCallback(portalHistoryHalo.data, portalHistoryHalo.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, portalHistoryHalo.positionCallback);
  }

  private removeHistoryHaloPrimitive(guid: string): boolean {
    const portalHistoryHalo = this.portalHistoryHalos.get(guid);
    if (!portalHistoryHalo) {
      this.portalHistoryHalosPendingCreation.delete(guid);
      return false;
    }

    this.removeHistoryHaloPrimitiveGroup(portalHistoryHalo);
    this.entityPositionManager.removePositionChangedCallback(portalHistoryHalo.data, portalHistoryHalo.positionCallback);
    this.portalHistoryHalos.delete(guid);
    this.portalHistoryHalosPendingCreation.delete(guid);
    return true;
  }

  private removeHistoryHaloPrimitiveGroup(portalHistoryHalo: PortalHistoryHalo): void {
    const pointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PORTAL_HISTORY_LAYER_ID).pointPrimitives;
    const reversePointPrimitives = this.layerManager.getOrCreatePrimitiveLayer(PORTAL_HISTORY_REVERSE_LAYER_ID).pointPrimitives;

    if (portalHistoryHalo.pointPrimitive) pointPrimitives.remove(portalHistoryHalo.pointPrimitive);
    if (portalHistoryHalo.occlusionPointPrimitive) pointPrimitives.remove(portalHistoryHalo.occlusionPointPrimitive);
    if (portalHistoryHalo.reversePointPrimitive) reversePointPrimitives.remove(portalHistoryHalo.reversePointPrimitive);
    if (portalHistoryHalo.reverseOcclusionPointPrimitive) reversePointPrimitives.remove(portalHistoryHalo.reverseOcclusionPointPrimitive);

    portalHistoryHalo.pointPrimitive = undefined;
    portalHistoryHalo.occlusionPointPrimitive = undefined;
    portalHistoryHalo.reversePointPrimitive = undefined;
    portalHistoryHalo.reverseOcclusionPointPrimitive = undefined;
  }

  private removeHistoryHaloPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.portalHistoryHalos.forEach((info, guid) => {
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

    toRemove.forEach((guid) => this.removeHistoryHaloPrimitive(guid));
    this.viewer.scene.requestRender();
  }
}

function applyHistoryHaloPosition(
  portalHistoryHalo: PortalHistoryHalo,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;

  if (portalHistoryHalo.pointPrimitive) {
    portalHistoryHalo.pointPrimitive.position = entityPosition.position;
    portalHistoryHalo.pointPrimitive.show = show;
  }
  if (portalHistoryHalo.occlusionPointPrimitive) {
    portalHistoryHalo.occlusionPointPrimitive.position = entityPosition.position;
    portalHistoryHalo.occlusionPointPrimitive.show = show;
  }
  if (portalHistoryHalo.reversePointPrimitive) {
    portalHistoryHalo.reversePointPrimitive.position = entityPosition.position;
    portalHistoryHalo.reversePointPrimitive.show = show;
  }
  if (portalHistoryHalo.reverseOcclusionPointPrimitive) {
    portalHistoryHalo.reverseOcclusionPointPrimitive.position = entityPosition.position;
    portalHistoryHalo.reverseOcclusionPointPrimitive.show = show;
  }
}

function addHistoryHaloPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  color: string,
  fadeByDistance: boolean,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize: HALO_POINT_PIXEL_SIZE,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA),
    outlineWidth: HALO_POINT_OUTLINE_WIDTH,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance: fadeByDistance ? createPortalNearFarScalar() : undefined,
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
  });
}

function addHistoryHaloOcclusionPointPrimitive(
  pointPrimitives: Cesium.PointPrimitiveCollection,
  primitiveId: PortalPrimitiveId,
  entityPosition: EntityPosition,
  color: string,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.PointPrimitive {
  return pointPrimitives.add({
    id: primitiveId,
    position: entityPosition.position,
    show: !entityPosition.isFallbackPosition,
    pixelSize: HALO_POINT_PIXEL_SIZE,
    color: Cesium.Color.TRANSPARENT,
    outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(HALO_POINT_ALPHA * PORTAL_OCCLUDED_ALPHA),
    outlineWidth: HALO_POINT_OUTLINE_WIDTH,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  });
}

function getPortalHistoryState(data: PortalData): PortalHistoryState {
  if (data.history?.captured) return "captured";
  else if (data.history?.visited) return "visited";
  else return "none";
}
