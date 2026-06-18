/**
 * Utility functions and classes for getting data tiles.
 */

import * as Cesium from "cesium";
import { apiRequest } from "../utils/network";
import { FieldData, LinkData, PortalData, RawEntity, TileResponse } from "../types/ingress";
import { ParsedEntities } from "../types/map";
import { logManager } from "./logManager";
import { settingsManager, type RefreshIntervalMs } from "./settingsManager";
import { PortalEntityManager, parsePortal } from "./portalEntityManager";
import { LinkEntityManager, parseLink } from "./linkEntityManager";
import { FieldEntityManager, parseField } from "./fieldEntityManager";
import { PortalLabelEntityManager } from "./portalLabelEntityManager";
import { PortalOrnamentEntityManager } from "./portalOrnamentEntityManager.ts";
import { PortalHistoryEntityManager } from "./portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "./scoutHistoryEntityManager";
import { setCookie } from "../utils/browser";

// Height at zoom level 0, shows more tiles if higher
export const HEIGHT_AT_ZOOM_ZERO = 96000000;

// Default tile limit to load
const MAX_TILES_TO_LOAD = 1800;

/**
 * Defines the number of tiles per edge to zoom into at each level of detail.
 *
 * This array is used to determine how many tiles should be displayed along each axis (width and height)
 * when zooming in on a map or grid. Each element corresponds to a specific zoom level, starting from 0.
 *
 * For example:
 * - Level 0: 1 tile per edge
 * - Level 3: 40 tiles per edge
 * - Level 8: 1000 tiles per edge
 *
 * @type {number[]}
 */
const DEFAULT_ZOOM_TO_TILES_PER_EDGE: number[] = [1, 1, 1, 40, 40, 80, 80, 320, 1000, 2000, 2000, 4000, 8000, 16000, 16000, 32000];

/**
 * An array representing the default zoom levels for different map regions or layers.
 *
 * The array contains integers where each integer corresponds to a zoom level.
 * The zoom levels are arranged in descending order of priority, typically from the most detailed to the least detailed view.
 *
 * @type {number[]}
 */
const DEFAULT_ZOOM_TO_LEVEL: number[] = [8, 8, 8, 8, 7, 7, 7, 6, 6, 5, 4, 4, 3, 2, 2, 1, 1];

/**
 * Represents the default zoom levels for link lengths in a mapping application.
 * The array contains numeric values corresponding to different zoom levels,
 * where each value specifies the maximum link length that can be displayed
 * at that particular zoom level. The values are ordered from highest (index 0)
 * to lowest (last index) zoom levels, allowing for more detailed representations
 * of shorter links as the user zooms in.
 *
 * @type {number[]}
 */
const DEFAULT_ZOOM_TO_LINK_LENGTH: number[] = [200000, 200000, 200000, 200000, 200000, 60000, 60000, 10000, 5000, 2500, 2500, 800, 300, 0, 0];

/**
 * The maximum number of parallel requests that can be sent at once to the server.
 *
 * @type {number}
 */
const MAX_REQUESTS: number = 5;

/**
 * The number of tiles requested in a single batch.
 *
 * @type {number}
 */
const TILES_PER_REQUEST: number = 25;

/**
 * The most horizon-facing pitch allowed when computing the tile to refresh.
 *
 * Cesium camera pitch is negative when looking down: -90 degrees is top-down, and
 * 0 degrees is the horizon. Clamping prevents near-horizon views from producing
 * an overly broad rectangle.
 */
const MAX_VIEW_RECTANGLE_PITCH = Cesium.Math.toRadians(-50);

/**
 * Represents parameters for configuring a tile in a grid or map system.
 *
 * @property {number} level - The zoom level of the tile, where higher numbers indicate more detailed tiles.
 * @property {number} tilesPerEdge - The number of tiles along one global edge of the grid at this level.
 * @property {number} minLinkLength - The minimum length allowed for links or paths within the tile.
 * @property {boolean} hasPortals - Indicates whether portals are present in the tile.
 * @property {number} zoom - The current zoom factor, affecting how detailed the tile appears.
 */
export interface TileParams {
  level: number;
  tilesPerEdge: number;
  minLinkLength: number;
  hasPortals: boolean;
  zoom: number;
}

export type TileStatus = "queued" | "requested" | "loaded" | "error";
export type TileStatusCallback = (key: string, status: TileStatus) => void;

export class TileRequest {
  public tileKeys: string[];
  public active: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor(tileKeys: string[]) {
    this.tileKeys = tileKeys;
  }

  public async send(): Promise<unknown> {
    this.active = true;
    try {
      const response = await apiRequest("getEntities", { tileKeys: this.tileKeys });
      this.active = false;
      return response;
    } catch (error) {
      this.active = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        return this.send();
      }
      throw error;
    }
  }
}

export class TileRequestManager {
  private activeRequestCount: number = 0;
  private queuedTiles: Set<string> = new Set();
  private requestedTiles: Set<string> = new Set();
  private tileStatuses: Map<string, TileStatus> = new Map();
  private tileStatusListeners: TileStatusCallback[] = [];
  private idleResolvers: (() => void)[] = [];
  private refreshIntervalId: number | null = null;
  private lastDataZoom: number | undefined;
  private lastTileKeysCount: number | undefined;

  constructor(
    private viewer: Cesium.Viewer,
    private portalEntityManager: PortalEntityManager,
    private portalLabelEntityManager: PortalLabelEntityManager,
    private portalOrnamentEntityManager: PortalOrnamentEntityManager,
    private portalHistoryEntityManager: PortalHistoryEntityManager,
    private scoutHistoryEntityManager: ScoutHistoryEntityManager,
    private linkEntityManager: LinkEntityManager,
    private fieldEntityManager: FieldEntityManager,
  ) {
    this.updateRefreshInterval(settingsManager.getRefreshIntervalMs());
  }

  public refreshView(): void {
    const tileKeys = this.calculateTileKeys();

    if (tileKeys.length > 0) {
      this.removeTiles(tileKeys);
      this.addTiles(tileKeys, true);
    }
  }

  public requestTilesForCurrentView(): void {
    const tileKeys = this.calculateTileKeys();
    if (tileKeys.length > 0) this.addTiles(tileKeys);
  }

  public getRefreshIntervalMs(): RefreshIntervalMs {
    return settingsManager.getRefreshIntervalMs();
  }

  public setRefreshIntervalMs(intervalMs: RefreshIntervalMs): void {
    settingsManager.setRefreshIntervalMs(intervalMs);
    this.updateRefreshInterval(intervalMs);
  }

  private updateRefreshInterval(intervalMs: RefreshIntervalMs): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }

    if (intervalMs === null) return;

    this.refreshIntervalId = window.setInterval(() => this.refreshView(), intervalMs);
  }

  public addTiles(tileKeys: string[], refreshExisting: boolean = false): void {
    logManager.debug("TileRequestManager", `Adding ${tileKeys.length} tiles to queue`);
    let skippedCount = 0;
    tileKeys.forEach((key) => {
      if (!this.requestedTiles.has(key) && !this.queuedTiles.has(key)) {
        this.queuedTiles.add(key);
        this.setTileStatus(key, "queued");
      } else {
        skippedCount += 1;
      }
    });
    logManager.debug("TileRequestManager", `Skipped ${skippedCount} tile${skippedCount === 1 ? "" : "s"}`);
    this.processQueue(refreshExisting).then();
  }

  public removeTiles(tileKeys: string[]): void {
    logManager.debug("TileRequestManager", `Removing ${tileKeys.length} tiles from registry`);
    tileKeys.forEach((key) => {
      if (this.queuedTiles.has(key)) {
        this.queuedTiles.delete(key);
      }
      if (this.requestedTiles.has(key)) {
        this.requestedTiles.delete(key);
      }
    });
    this.processQueue().then();
  }

  public onTileStatusChange(callback: TileStatusCallback): void {
    this.tileStatusListeners.push(callback);
  }

  public waitForIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();

    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private isIdle(): boolean {
    return this.activeRequestCount === 0 && this.queuedTiles.size === 0;
  }

  private resolveIdleWaiters(): void {
    if (!this.isIdle()) return;

    const resolvers = this.idleResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
  }

  private setTileStatus(key: string, status: TileStatus): void {
    this.tileStatuses.set(key, status);
    this.tileStatusListeners.forEach((cb) => cb(key, status));
  }

  private calculateTileKeys(): string[] {
    const camera = this.viewer.camera;
    const cartographic = camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height;

    const calculatedZoom = Math.round(Math.log2(HEIGHT_AT_ZOOM_ZERO / height));
    const mapZoom = isNaN(calculatedZoom) ? 0 : calculatedZoom;
    const dataZoom = getDataZoomForMapZoom(mapZoom);

    setCookie("ingress.intelmap.lat", lat.toFixed(6));
    setCookie("ingress.intelmap.lng", lng.toFixed(6));
    setCookie("ingress.intelmap.zoom", mapZoom.toString());

    const tileParams = getMapZoomTileParameters(dataZoom);
    const viewRect = this.computeViewRectangle(this.viewer.scene.globe.ellipsoid);

    if (viewRect) {
      const west = Cesium.Math.toDegrees(viewRect.west);
      const south = Cesium.Math.toDegrees(viewRect.south);
      const east = Cesium.Math.toDegrees(viewRect.east);
      const north = Cesium.Math.toDegrees(viewRect.north);

      const minX = lngToTileIndex(west, tileParams);
      const maxX = lngToTileIndex(east, tileParams);
      const minY = latToTileIndex(north, tileParams);
      const maxY = latToTileIndex(south, tileParams);

      const tileKeys: string[] = [];
      const tilesPerEdge = tileParams.tilesPerEdge;
      for (let x = minX; ; x = (x + 1) % tilesPerEdge) {
        for (let y = minY; y <= maxY; y++) {
          tileKeys.push(generateTileKey(tileParams, x, y));
          if (tileKeys.length >= MAX_TILES_TO_LOAD) {
            logManager.warn("TileRequestManager", "Too many tiles to load, truncating.");
            break;
          }
        }
        if (x === maxX || tileKeys.length >= MAX_TILES_TO_LOAD) break;
      }
      const totalTilesForZoom = tilesPerEdge * tilesPerEdge;
      if (dataZoom <= 3 && this.lastDataZoom === dataZoom && tileKeys.length === this.lastTileKeysCount) {
        if (tileKeys.length >= totalTilesForZoom || tileKeys.length >= MAX_TILES_TO_LOAD) {
          return [];
        }
      }

      this.lastDataZoom = dataZoom;
      this.lastTileKeysCount = tileKeys.length;

      return tileKeys;
    }

    return [];
  }

  private computeViewRectangle(
    ellipsoid: Cesium.Ellipsoid,
    maxPitch: number = MAX_VIEW_RECTANGLE_PITCH
  ): Cesium.Rectangle | undefined {
    const camera = this.viewer.camera;
    const pitch = Math.min(camera.pitch, maxPitch);

    if (pitch === camera.pitch) {
      return camera.computeViewRectangle(ellipsoid);
    }

    const scene = this.viewer.scene;
    const clampedCamera = new Cesium.Camera(scene);
    clampedCamera.frustum = camera.frustum.clone();
    clampedCamera.setView({
      destination: Cesium.Cartesian3.clone(camera.positionWC),
      orientation: {
        heading: camera.heading,
        pitch,
        roll: camera.roll,
      },
      endTransform: Cesium.Matrix4.clone(camera.transform),
    });

    return clampedCamera.computeViewRectangle(ellipsoid);
  }

  private async processQueue(refreshExisting: boolean = false): Promise<void> {
    if (this.activeRequestCount >= MAX_REQUESTS) {
      logManager.info("TileRequestManager", `Max request count of ${MAX_REQUESTS} reached`);
      return;
    }

    if (this.queuedTiles.size === 0) {
      logManager.info("TileRequestManager", "Loaded all tiles");
      this.resolveIdleWaiters();
      return;
    }

    const tilesToRequest = Array.from(this.queuedTiles).slice(0, TILES_PER_REQUEST);
    tilesToRequest.forEach((key) => {
      this.queuedTiles.delete(key);
      this.requestedTiles.add(key);
      this.setTileStatus(key, "requested");
    });

    const request = new TileRequest(tilesToRequest);
    this.activeRequestCount++;

    logManager.debug("TileRequestManager", `Sending request for ${tilesToRequest.length} tiles`);
    const size = this.queuedTiles.size + tilesToRequest.length;
    logManager.info(
      "TileRequestManager",
      `Loading ${size} tile${size === 1 ? "" : "s"}`
    );

    try {
      const response = await request.send();
      logManager.debug("TileRequestManager", `Received response for ${tilesToRequest.length} tile${tilesToRequest.length === 1 ? "" : "s"}`);
      if (response && refreshExisting) {
        const viewRect = this.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
        if (!viewRect) return;
        this.portalEntityManager.removePortalInView(viewRect);
        this.portalLabelEntityManager.removeLabelInView(viewRect);
        this.portalOrnamentEntityManager.removeOrnamentInView(viewRect);
        this.portalHistoryEntityManager.removeHistoryHaloInView(viewRect);
        this.scoutHistoryEntityManager.removeScoutControlHaloInView(viewRect);
        this.linkEntityManager.removeLinkInView(viewRect);
        this.fieldEntityManager.removeFieldInView(viewRect);
        logManager.debug("TileRequestManager", "Removed entities from current view");
      }
      this.handleResponse(response, tilesToRequest);
    } catch (error) {
      logManager.error("TileRequestManager", "Tile request failed:", error);
      tilesToRequest.forEach((key) => {
        this.requestedTiles.delete(key);
        this.setTileStatus(key, "error");
      });
    } finally {
      this.activeRequestCount--;
      this.processQueue().then(() => this.resolveIdleWaiters());
    }
  }

  private handleResponse(response: unknown, tileKeys: string[]): void {
    const data = response as TileResponse;
    if (!data || !data.result) {
      logManager.warn("TileRequestManager", "Invalid response data:", data);
      tileKeys.forEach((key) => {
        this.requestedTiles.delete(key);
        this.setTileStatus(key, "error");
      });
      return;
    }

    let entitiesFound = 0;

    for (const tileKey of tileKeys) {
      const tileData = data.result.map[tileKey];
      if (!tileData) {
        this.requestedTiles.delete(tileKey);
        this.setTileStatus(tileKey, "error");
        continue;
      }

      if (tileData.error) {
        // Ignore TIMEOUT errors from Niantic's internal server (which seems like intended)
        // and delete them from the requestedTiles for further retrying
        if (tileData.error == "TIMEOUT") {
          this.setTileStatus(tileKey, "loaded");
        } else {
          logManager.warn("TileRequestManager", `Tile ${tileKey} failed: ${tileData.error}`);
          this.setTileStatus(tileKey, "error");
        }
        this.requestedTiles.delete(tileKey);
        continue;
      }

      this.setTileStatus(tileKey, "loaded");

      if (tileData.gameEntities) {
        entitiesFound += tileData.gameEntities.length;
        const { portals, links, fields } = parseTileEntities(tileData.gameEntities);
        portals.forEach((p) => this.portalEntityManager.addOrUpdatePortal(p));
        portals.forEach((p) => this.portalLabelEntityManager.addOrUpdateLabel(p));
        portals.forEach((p) => this.portalOrnamentEntityManager.addOrUpdateOrnament(p));
        portals.forEach((p) => this.portalHistoryEntityManager.addOrUpdateHistoryHalo(p));
        portals.forEach((p) => this.scoutHistoryEntityManager.addOrUpdateScoutControlHalo(p));
        links.forEach((l) => this.linkEntityManager.addOrUpdateLink(l));
        fields.forEach((f) => this.fieldEntityManager.addOrUpdateField(f));
      }
    }

    logManager.debug("TileRequestManager", `Processed ${entitiesFound} entities`);
    this.viewer.scene.requestRender();
  }
}

export function getMapZoomTileParameters(zoom: number): TileParams {
  // Clamp zoom to [0, max supported zoom]
  const maxZoom = DEFAULT_ZOOM_TO_TILES_PER_EDGE.length - 1;
  const clampedZoom = Math.max(0, Math.min(maxZoom, zoom));

  return {
    zoom: clampedZoom,
    level: DEFAULT_ZOOM_TO_LEVEL[clampedZoom] ?? 0,
    tilesPerEdge: DEFAULT_ZOOM_TO_TILES_PER_EDGE[clampedZoom] ?? 32000,
    minLinkLength: DEFAULT_ZOOM_TO_LINK_LENGTH[clampedZoom] ?? 0,
    hasPortals: clampedZoom >= DEFAULT_ZOOM_TO_LINK_LENGTH.length || DEFAULT_ZOOM_TO_LINK_LENGTH[clampedZoom] === 0,
  };
}

export function getDataZoomForMapZoom(zoom: number): number {
  // Handle invalid or too small zoom levels
  if (isNaN(zoom) || zoom < 3) {
    return 3;
  }

  // Limit zoom level (stock site max zoom may vary, but 21 is common)
  if (zoom > 21) {
    zoom = 21;
  }

  // To improve caching performance, we use the same zoom level for data requests
  // if the tile parameters (tilesPerEdge, level, hasPortals) are identical.
  const origParams = getMapZoomTileParameters(zoom);
  while (zoom > 3) {
    const nextParams = getMapZoomTileParameters(zoom - 1);
    if (
      nextParams.tilesPerEdge !== origParams.tilesPerEdge ||
      nextParams.hasPortals !== origParams.hasPortals ||
      nextParams.level * (nextParams.hasPortals ? 1 : 0) !== origParams.level * (origParams.hasPortals ? 1 : 0)
    ) {
      break;
    }
    zoom--;
  }

  return zoom;
}

export function lngToTileIndex(lng: number, params: TileParams): number {
  const x = Math.floor(((lng + 180) / 360) * params.tilesPerEdge);
  return Math.max(0, Math.min(params.tilesPerEdge - 1, x));
}

export function latToTileIndex(lat: number, params: TileParams): number {
  // Clamp latitude to the range supported by Web Mercator to avoid math errors at the poles.
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * params.tilesPerEdge);
  return Math.max(0, Math.min(params.tilesPerEdge - 1, y));
}

export function tileToLat(y: number, params: TileParams): number {
  const n = Math.PI - (2 * Math.PI * y) / params.tilesPerEdge;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileToLng(x: number, params: TileParams): number {
  return (x / params.tilesPerEdge) * 360 - 180;
}

export function generateTileKey(params: TileParams, x: number, y: number): string {
  return `${params.zoom}_${x}_${y}_${params.level}_8_100`;
}

export function parseTileEntities(entities: RawEntity[]): ParsedEntities {
  const portals: PortalData[] = [];
  const links: LinkData[] = [];
  const fields: FieldData[] = [];

  for (const ent of entities) {
    const type = ent[2][0];
    switch (type) {
      case "p":
        portals.push(parsePortal(ent));
        break;
      case "e":
        links.push(parseLink(ent));
        break;
      case "r":
        fields.push(parseField(ent));
        break;
    }
  }

  return { portals, links, fields };
}
