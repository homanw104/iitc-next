/**
 * Utility functions and classes for getting data tiles.
 */

import { apiRequest } from "./network";
import { TileResponse } from "../types/ingress";
import { parseTileEntities, EntityManager } from "./entity";
import { logger } from "./logger";

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
 * Represents parameters for configuring a tile in a grid or map system.
 *
 * @property {number} level - The zoom level of the tile, where higher numbers indicate more detailed tiles.
 * @property {number} tilesPerEdge - The number of tiles along one edge of the grid at this level.
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

/**
 * TileRequest class for managing a single request for a group of tiles.
 */
export class TileRequest {
  public tileKeys: string[];
  public active: boolean = false;
  public retryCount: number = 0;
  private maxRetries: number = 5;

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

/**
 * TileRequestManager class for managing multiple TileRequests.
 */
export class TileManager {
  private activeRequestCount: number = 0;
  private maxRequests: number = 5;
  private tilesPerRequest: number = 25;
  private queuedTiles: Set<string> = new Set();
  private requestedTiles: Set<string> = new Set();
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  /**
   * Adds a list of tile keys to the queue for processing.
   *
   * @param tileKeys - An array of string keys representing the tiles to be added.
   */
  public addTiles(tileKeys: string[]): void {
    logger.debug("TileManager", `Adding ${tileKeys.length} tiles to queue.`);
    tileKeys.forEach((key) => {
      if (!this.requestedTiles.has(key)) {
        this.queuedTiles.add(key);
      }
    });
    this.processQueue().then();
  }

  /**
   * Processes the tile queue by sending requests for tiles up to the maximum allowed concurrent requests.
   * If the active request count has reached the limit or there are no tiles in the queue, it returns immediately.
   * Otherwise, it dequeues a batch of tiles, sends them as a request, and handles the response or error accordingly.
   * After processing, it recursively calls itself to process any remaining tiles in the queue.
   *
   * @return {Promise<void>} - A promise that resolves when the tile processing is complete or no more tiles are available to process.
   */
  private async processQueue(): Promise<void> {
    if (this.activeRequestCount >= this.maxRequests || this.queuedTiles.size === 0) {
      return;
    }

    const tilesToRequest = Array.from(this.queuedTiles).slice(0, this.tilesPerRequest);
    tilesToRequest.forEach((key) => {
      this.queuedTiles.delete(key);
      this.requestedTiles.add(key);
    });

    const request = new TileRequest(tilesToRequest);
    this.activeRequestCount++;

    logger.info("TileManager", `Sending request for ${tilesToRequest.length} tiles.`);
    logger.info("TileManager", `Active requests: ${this.activeRequestCount}.`);

    try {
      const response = await request.send();
      logger.info("TileManager", `Received response for ${tilesToRequest.length} tiles.`);
      this.handleResponse(response, tilesToRequest);
    } catch (error) {
      logger.error("TileManager", "Tile request failed:", error);
    } finally {
      this.activeRequestCount--;
      this.processQueue().then();
    }
  }

  /**
   * Handles the response from a tile request.
   *
   * @param response - The unknown response object to be processed.
   * @param tileKeys - An array of tile keys used to access specific data within the response.
   */
  private handleResponse(response: unknown, tileKeys: string[]): void {
    const data = response as TileResponse;
    if (!data || !data.result) {
      logger.warn("TileManager", "Invalid response data:", data);
      return;
    }

    let entitiesFound = 0;
    for (const tileKey of tileKeys) {
      const tileData = data.result[tileKey];
      if (!tileData) continue;

      if (tileData.deletedGameEntityGuids) {
        tileData.deletedGameEntityGuids.forEach((guid) => this.entityManager.removeEntity(guid));
      }

      if (tileData.gameEntities) {
        entitiesFound += tileData.gameEntities.length;
        const { portals, links, fields } = parseTileEntities(tileData.gameEntities);
        portals.forEach((p) => this.entityManager.addOrUpdatePortal(p));
        links.forEach((l) => this.entityManager.addOrUpdateLink(l));
        fields.forEach((f) => this.entityManager.addOrUpdateField(f));
      }
    }
    logger.info("TileManager", `Processed ${entitiesFound} entities from ${tileKeys.length} tiles.`);
  }
}

/**
 * Retrieves tile parameters for a given map zoom level.
 *
 * @param {number} zoom - The zoom level for which to retrieve tile parameters.
 * @return {TileParams} An object containing the tile parameters for the specified zoom level.
 */
export function getMapZoomTileParameters(zoom: number): TileParams {
  const maxTilesPerEdge = DEFAULT_ZOOM_TO_TILES_PER_EDGE[DEFAULT_ZOOM_TO_TILES_PER_EDGE.length - 1];

  return {
    level: DEFAULT_ZOOM_TO_LEVEL[zoom] || 0,
    tilesPerEdge: DEFAULT_ZOOM_TO_TILES_PER_EDGE[zoom] || maxTilesPerEdge,
    minLinkLength: DEFAULT_ZOOM_TO_LINK_LENGTH[zoom] || 0,
    hasPortals: zoom >= DEFAULT_ZOOM_TO_LINK_LENGTH.length,
    zoom: zoom,
  };
}

/**
 * Converts a longitude to a tile index.
 *
 * @param lng - The longitude value to convert.
 * @param params - An object containing parameters required for the conversion:
 *   tilesPerEdge - The total number of tiles along one edge of the map.
 *
 * @return The tile X index corresponding to the provided longitude and map parameters.
 */
export function lngToTileIndex(lng: number, params: TileParams): number {
  return Math.floor(((lng + 180) / 360) * params.tilesPerEdge);
}

/**
 * Converts a latitude to a tile index (Y coordinate) using the Web Mercator projection.
 *
 * This implementation follows the Slippy Map tiling system rules used by Ingress Intel.
 * At latitude 0, it returns tilesPerEdge / 2.
 *
 * @param lat - The latitude value to convert. Must be within the range of approximately -85.05 to 85.05 degrees for Web Mercator.
 * @param params - An object containing parameters required for the conversion:
 *   tilesPerEdge - The total number of tiles along one edge of the map.
 *
 * @return The tile Y index corresponding to the given latitude.
 */
export function latToTileIndex(lat: number, params: TileParams): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * params.tilesPerEdge);
}

/**
 * Converts a tile Y index back to latitude.
 *
 * @param y - The tile Y index.
 * @param params - Tile parameters including tilesPerEdge.
 * @returns The latitude in degrees.
 */
export function tileToLat(y: number, params: TileParams): number {
  const n = Math.PI - (2 * Math.PI * y) / params.tilesPerEdge;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Converts a tile X index back to longitude.
 *
 * @param x - The tile X index.
 * @param params - Tile parameters including tilesPerEdge.
 * @returns The longitude in degrees.
 */
export function tileToLng(x: number, params: TileParams): number {
  return (x / params.tilesPerEdge) * 360 - 180;
}

/**
 * Converts geographic coordinates to a tile ID based on the provided parameters.
 *
 * @param params - An object containing zoom level and other relevant parameters for tiling.
 * @param x - The X index of the tile.
 * @param y - The Y index of the tile.
 * @returns A string representing the unique tile ID.
 */
export function generateTileKey(params: TileParams, x: number, y: number): string {
  return `${params.zoom}_${x}_${y}_${params.level}_8_100`;
}
