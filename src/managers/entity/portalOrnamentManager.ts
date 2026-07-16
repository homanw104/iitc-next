/**
 * Manages portal ornament billboard primitives.
 */

import * as Cesium from "cesium";
import { GM_xmlhttpRequest, monkeyWindow } from "vite-plugin-monkey/dist/client";
import ap1OrnamentUrl from "../../images/ornaments/ap1.svg";
import ap1VolatileOrnamentUrl from "../../images/ornaments/ap1_v.svg";
import ap2OrnamentUrl from "../../images/ornaments/ap2.svg";
import ap2VolatileOrnamentUrl from "../../images/ornaments/ap2_v.svg";
import ap3OrnamentUrl from "../../images/ornaments/ap3.svg";
import ap3VolatileOrnamentUrl from "../../images/ornaments/ap3_v.svg";
import ap5OrnamentUrl from "../../images/ornaments/ap5.svg";
import ap5VolatileOrnamentUrl from "../../images/ornaments/ap5_v.svg";
import battleBeaconScheduledOrnamentUrl from "../../images/ornaments/bb_s.svg";
import type { PortalData } from "../../types/iitc/portal";
import type { LayerManager } from "../layer/layerManager";
import { logManager } from "../system/logManager";
import type { EntityPosition, EntityPositionCallback, EntityPositionManager } from "./entityPositionManager";
import type { EntityTranslucencyManager, TranslucencyByDistanceCallback } from "./entityTranslucencyManager";
import {
  PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
  PORTAL_OCCLUDED_ALPHA,
  createPortalNearFarScalar,
  createPortalPrimitiveId,
  getPortalDisableDepthTestDistance,
  type PortalPrimitiveId,
} from "./portalManager";

const CANVAS_DIMENSION = 64;
const ORNAMENT_LAYER_ID = "ornaments";
const ORNAMENT_PRIMITIVE_Z_INDEX = -10;
const ORNAMENT_IMAGE_ID_PREFIX = "portal-ornament-";
const REMOTE_ORNAMENT_IMAGE_BASE_URL = "https://commondatastorage.googleapis.com/ingress.com/img/map_icons/marker_images/";
const REMOTE_ORNAMENT_IMAGE_TIMEOUT_MS = 15_000;
const LOG_TAG = "PortalOrnamentManager";

const LOCAL_ORNAMENT_URLS: Readonly<Record<string, string>> = {
  ap1: ap1OrnamentUrl,
  ap1_v: ap1VolatileOrnamentUrl,
  ap2: ap2OrnamentUrl,
  ap2_v: ap2VolatileOrnamentUrl,
  ap3: ap3OrnamentUrl,
  ap3_v: ap3VolatileOrnamentUrl,
  ap5: ap5OrnamentUrl,
  ap5_v: ap5VolatileOrnamentUrl,
  bb_s: battleBeaconScheduledOrnamentUrl,
};

type UserscriptWindow = Window & {
  GM?: {
    xmlHttpRequest?: typeof GM_xmlhttpRequest,
  },
  GM_xmlhttpRequest?: typeof GM_xmlhttpRequest,
};

const ornamentImageCache = new Map<string, Promise<HTMLCanvasElement>>();
const sourceImageCache = new Map<string, Promise<HTMLImageElement>>();

interface Ornament {
  data: PortalData;
  billboard: Cesium.Billboard;
  occlusionBillboard: Cesium.Billboard;
  positionCallback: EntityPositionCallback;
}

export class PortalOrnamentManager {
  private readonly ornaments: Map<string, Ornament> = new Map();
  private readonly ornamentsPendingCreation: Set<string> = new Set();
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
      this.ornaments.forEach((ornament) => {
        ornament.occlusionBillboard.translucencyByDistance = this.currentTranslucencyByDistance;
      });
      if (this.ornaments.size > 0) this.viewer.scene.requestRender();
    };
    entityTranslucencyManager.addTranslucencyByDistanceChangedCallback(this.translucencyByDistanceCallback);
  }

  public async addOrUpdateOrnaments(portals: PortalData[]): Promise<void> {
    await Promise.all(portals.map((portal) => this.addOrUpdateOrnament(portal)));
    this.viewer.scene.requestRender();
  }

  public async addOrUpdateOrnament(data: PortalData): Promise<void> {
    if (!data.ornaments?.length) {
      this.removeOrnamentPrimitive(data.guid);
      this.viewer.scene.requestRender();
      return;
    }

    const existing = this.ornaments.get(data.guid);
    if (existing) {
      await this.updateExistingOrnament(existing, data);
    } else {
      await this.createAndStoreOrnament(data);
    }
    this.viewer.scene.requestRender();
  }

  public removeOrnament(guid: string): void {
    if (this.removeOrnamentPrimitive(guid)) this.viewer.scene.requestRender();
  }

  public removeOrnamentsInView(viewRect: Cesium.Rectangle): void {
    this.removeOrnamentPrimitivesInView(viewRect);
  }

  private async updateExistingOrnament(ornament: Ornament, data: PortalData): Promise<void> {
    await this.updateOrnamentPrimitives(ornament, data);
    this.updateOrnamentPositionSubscription(ornament, data);
    ornament.data = data;
  }

  private async createAndStoreOrnament(data: PortalData): Promise<void> {
    if (this.ornamentsPendingCreation.has(data.guid)) return;

    this.ornamentsPendingCreation.add(data.guid);
    try {
      const primitiveId = createPortalPrimitiveId(data.guid);
      const { billboard, occlusionBillboard } = await this.createOrnamentPrimitives(data, primitiveId);
      const ornament: Ornament = {
        data,
        billboard,
        occlusionBillboard,
        positionCallback: (entityPosition: EntityPosition) => {
          applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
        },
      };
      this.entityPositionManager.addPositionChangedCallback(data, ornament.positionCallback);
      this.ornaments.set(data.guid, ornament);
    } finally {
      this.ornamentsPendingCreation.delete(data.guid);
    }
  }

  private async createOrnamentPrimitives(data: PortalData, primitiveId: PortalPrimitiveId): Promise<{
    billboard: Cesium.Billboard;
    occlusionBillboard: Cesium.Billboard
  }> {
    const billboards = this.getOrnamentBillboards();
    const [entityPosition, image] = await Promise.all([
      this.entityPositionManager.getEntityPosition(data),
      getOrnamentImage(data),
    ]);

    const show = !entityPosition.isFallbackPosition;
    const billboard = addOrnamentBillboard(billboards, primitiveId, image, entityPosition.position, show);
    const occlusionBillboard = addOrnamentOcclusionBillboard(
      billboards,
      primitiveId,
      image,
      entityPosition.position,
      show,
      this.currentTranslucencyByDistance,
    );
    return { billboard, occlusionBillboard };
  }

  private async updateOrnamentPrimitives(ornament: Ornament, data: PortalData): Promise<void> {
    const [entityPosition, image] = await Promise.all([
      this.entityPositionManager.getEntityPosition(data),
      getOrnamentImage(data),
    ]);

    applyOrnamentPosition(ornament.billboard, ornament.occlusionBillboard, entityPosition);
    setOrnamentBillboardImage(ornament.billboard, data, image);
    setOrnamentBillboardImage(ornament.occlusionBillboard, data, image);
  }

  private updateOrnamentPositionSubscription(ornament: Ornament, data: PortalData): void {
    if (ornament.data.latE6 === data.latE6 && ornament.data.lngE6 === data.lngE6) return;

    this.entityPositionManager.removePositionChangedCallback(ornament.data, ornament.positionCallback);
    this.entityPositionManager.addPositionChangedCallback(data, ornament.positionCallback);
  }

  private removeOrnamentPrimitive(guid: string): boolean {
    const ornamentInfo = this.ornaments.get(guid);
    if (!ornamentInfo) {
      this.ornamentsPendingCreation.delete(guid);
      return false;
    }

    const billboards = this.getOrnamentBillboards();

    billboards.remove(ornamentInfo.billboard);
    billboards.remove(ornamentInfo.occlusionBillboard);

    this.entityPositionManager.removePositionChangedCallback(ornamentInfo.data, ornamentInfo.positionCallback);
    this.ornaments.delete(guid);
    this.ornamentsPendingCreation.delete(guid);
    return true;
  }

  private removeOrnamentPrimitivesInView(viewRect: Cesium.Rectangle): void {
    const toRemove: string[] = [];
    this.ornaments.forEach((info, guid) => {
      const position = info.billboard.position ?? info.occlusionBillboard.position;
      if (position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        if (Cesium.Rectangle.contains(viewRect, cartographic)) {
          toRemove.push(guid);
        }
      }
    });
    if (toRemove.length === 0) return;

    toRemove.forEach((guid) => this.removeOrnamentPrimitive(guid));
    this.viewer.scene.requestRender();
  }

  private getOrnamentBillboards(): Cesium.BillboardCollection {
    return this.layerManager.getOrCreatePrimitiveLayer(ORNAMENT_LAYER_ID, ORNAMENT_PRIMITIVE_Z_INDEX).billboards;
  }
}

function applyOrnamentPosition(
  billboard: Cesium.Billboard,
  occlusionBillboard: Cesium.Billboard,
  entityPosition: EntityPosition,
): void {
  const show = !entityPosition.isFallbackPosition;
  billboard.position = entityPosition.position;
  billboard.show = show;
  occlusionBillboard.position = entityPosition.position;
  occlusionBillboard.show = show;
}

function addOrnamentBillboard(
  billboards: Cesium.BillboardCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  position: Cesium.Cartesian3,
  show: boolean,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image,
    heightReference: Cesium.HeightReference.NONE,
    disableDepthTestDistance: getPortalDisableDepthTestDistance(),
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: createPortalNearFarScalar(),
  });
}

function addOrnamentOcclusionBillboard(
  billboards: Cesium.BillboardCollection,
  primitiveId: PortalPrimitiveId,
  image: HTMLCanvasElement,
  position: Cesium.Cartesian3,
  show: boolean,
  translucencyByDistance: Cesium.NearFarScalar,
): Cesium.Billboard {
  return billboards.add({
    id: primitiveId,
    position,
    show,
    image,
    color: Cesium.Color.WHITE.withAlpha(PORTAL_OCCLUDED_ALPHA),
    heightReference: Cesium.HeightReference.NONE,
    disableDepthTestDistance: PORTAL_OCCLUSION_DISABLE_DEPTH_TEST_DISTANCE,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: createPortalNearFarScalar(),
    translucencyByDistance,
  });
}

function setOrnamentBillboardImage(
  billboard: Cesium.Billboard,
  data: PortalData,
  image: HTMLCanvasElement,
): void {
  billboard.setImage(getOrnamentImageId(data), image);
}

async function getOrnamentImage(data: PortalData): Promise<HTMLCanvasElement> {
  const cacheKey = getOrnamentImageCacheKey(data);
  const cached = ornamentImageCache.get(cacheKey);
  if (cached) return cached;

  const imagePromise = createOrnamentImage(data);
  ornamentImageCache.set(cacheKey, imagePromise);

  try {
    return await imagePromise;
  } catch (error) {
    ornamentImageCache.delete(cacheKey);
    throw error;
  }
}

async function createOrnamentImage(data: PortalData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_DIMENSION;
  canvas.height = CANVAS_DIMENSION;

  const context = canvas.getContext("2d");
  if (!context) return canvas;

  for (const ornamentId of new Set(data.ornaments || [])) {
    const localUrl = LOCAL_ORNAMENT_URLS[ornamentId];
    const imageUrl = localUrl || getRemoteOrnamentImageUrl(ornamentId);
    try {
      await drawOrnamentImage(context, imageUrl, !localUrl);
    } catch (error) {
      logManager.warn(LOG_TAG, `Failed to load ornament image for ${ornamentId}`, error);
    }
  }

  return canvas;
}

async function drawOrnamentImage(
  context: CanvasRenderingContext2D,
  url: string,
  isRemote: boolean,
): Promise<void> {
  const image = await loadSourceImage(url, isRemote);
  context.drawImage(image, 0, 0, CANVAS_DIMENSION, CANVAS_DIMENSION);
}

function loadSourceImage(url: string, isRemote: boolean): Promise<HTMLImageElement> {
  const cached = sourceImageCache.get(url);
  if (cached) return cached;

  const imagePromise = (isRemote ? loadRemoteSourceImage(url) : loadImage(url))
    .catch((error: unknown) => {
      sourceImageCache.delete(url);
      throw error;
    });
  sourceImageCache.set(url, imagePromise);
  return imagePromise;
}

async function loadRemoteSourceImage(url: string): Promise<HTMLImageElement> {
  const blob = await fetchRemoteOrnamentImage(url);
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load portal ornament image: ${url}`));
    image.src = url;
  });
}

async function fetchRemoteOrnamentImage(url: string): Promise<Blob> {
  const userscriptRequest = getUserscriptXmlHttpRequest();
  if (!userscriptRequest) {
    throw new Error("GM_xmlhttpRequest is not available for portal ornament image loading.");
  }
  return fetchRemoteOrnamentImageWithUserscript(userscriptRequest, url);
}

function getUserscriptXmlHttpRequest(): typeof GM_xmlhttpRequest | undefined {
  if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;
  if (typeof monkeyWindow.GM_xmlhttpRequest === "function") return monkeyWindow.GM_xmlhttpRequest;
  if (typeof monkeyWindow.GM?.xmlHttpRequest === "function") {
    return monkeyWindow.GM.xmlHttpRequest as typeof GM_xmlhttpRequest;
  }

  const userscriptWindow = getMountedUserscriptWindow();
  if (typeof userscriptWindow?.GM_xmlhttpRequest === "function") {
    return userscriptWindow.GM_xmlhttpRequest;
  }
  if (typeof userscriptWindow?.GM?.xmlHttpRequest === "function") {
    return userscriptWindow.GM.xmlHttpRequest as typeof GM_xmlhttpRequest;
  }
  return undefined;
}

function getMountedUserscriptWindow(): UserscriptWindow | undefined {
  for (const key of Object.getOwnPropertyNames(document)) {
    if (!key.startsWith("__monkeyWindow-")) continue;

    const value = (document as unknown as Record<string, unknown>)[key];
    if (typeof value === "object" && value !== null) return value as UserscriptWindow;
  }
  return undefined;
}

function fetchRemoteOrnamentImageWithUserscript(
  userscriptRequest: typeof GM_xmlhttpRequest,
  url: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    userscriptRequest<"blob">({
      method: "GET",
      url,
      responseType: "blob",
      anonymous: true,
      timeout: REMOTE_ORNAMENT_IMAGE_TIMEOUT_MS,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300 && isBlob(response.response)) {
          resolve(response.response);
        } else {
          reject(new Error(`Failed to fetch portal ornament image: ${response.status}`));
        }
      },
      onerror: () => reject(new Error(`Failed to fetch portal ornament image: ${url}`)),
      ontimeout: () => reject(new Error(`Timed out fetching portal ornament image: ${url}`)),
    });
  });
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob || Object.prototype.toString.call(value) === "[object Blob]";
}

function getRemoteOrnamentImageUrl(ornamentId: string): string {
  return `${REMOTE_ORNAMENT_IMAGE_BASE_URL}${encodeURIComponent(ornamentId)}.png`;
}

function getOrnamentImageId(data: PortalData): string {
  return `${ORNAMENT_IMAGE_ID_PREFIX}${getOrnamentImageCacheKey(data)}`;
}

function getOrnamentImageCacheKey(data: PortalData): string {
  return (data.ornaments || []).toString();
}
