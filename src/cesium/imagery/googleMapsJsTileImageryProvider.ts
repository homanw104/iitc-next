/**
 * Adapts the stock Google Maps JavaScript tile renderer into a Cesium imagery provider.
 *
 * The stock Intel map already loads Google Maps JavaScript and has access to its
 * tile session. Cesium cannot consume that DOM renderer directly, so this provider
 * observes the Google Maps tile images, fetches their bytes through the userscript
 * request API when needed, and returns texture-safe canvases through Cesium's
 * ImageryProvider contract.
 */

import * as Cesium from "cesium";
import type { ImageryTypes } from "cesium";
import { GM_xmlhttpRequest } from "vite-plugin-monkey/dist/client";
import { safeWindow } from "../../utils/window.ts";

export type GoogleMapsJsMapType = "roadmap" | "satellite" | "hybrid" | "terrain";
export type GoogleMapsJsOverlayLayerName = "TrafficLayer" | "TransitLayer";

export type GoogleMapsJsStyle = {
  featureType?: string;
  elementType?: string;
  stylers: Array<Record<string, boolean | number | string>>;
};

export type GoogleMapsJsTileImageryProviderOptions = {
  mapType: GoogleMapsJsMapType;
  styles?: GoogleMapsJsStyle[];
  overlayLayer?: GoogleMapsJsOverlayLayerName;
};

type TileCoords = {
  x: number;
  y: number;
  z: number;
};

type GoogleLatLng = unknown;

type GoogleMap = {
  setCenter(center: GoogleLatLng): void;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
};

type GoogleMapsLayer = {
  setMap(map: GoogleMap | null): void;
};

type GoogleMapsNamespace = {
  Map: new (container: HTMLElement, options: GoogleMapOptions) => GoogleMap;
  LatLng: new (lat: number, lng: number) => GoogleLatLng;
  TrafficLayer?: new (options?: Record<string, unknown>) => GoogleMapsLayer;
  TransitLayer?: new (options?: Record<string, unknown>) => GoogleMapsLayer;
  event?: {
    trigger(instance: unknown, eventName: string): void;
  };
};

type GoogleMapOptions = {
  center: { lat: number; lng: number };
  zoom: number;
  tilt: number;
  mapTypeId: GoogleMapsJsMapType;
  disableDefaultUI: boolean;
  keyboardShortcuts: boolean;
  draggable: boolean;
  disableDoubleClickZoom: boolean;
  scrollwheel: boolean;
  styles: GoogleMapsJsStyle[];
  backgroundColor: string;
};

type WindowWithGoogleMaps = Window & typeof globalThis & {
  google?: {
    maps?: GoogleMapsNamespace;
  };
};

type PendingTileGroup = {
  coords: TileCoords;
  waiters: Set<PendingTileWaiter>;
};

type PendingTileWaiter = {
  resolve(url: string): void;
  reject(error: Error): void;
  timeoutId: number;
};

type LoadedTileImage = {
  image: CanvasImageSource;
  release?: () => void;
};

const GOOGLE_MAPS_API_TIMEOUT_MS = 30_000;
const TILE_REQUEST_TIMEOUT_MS = 20_000;
const TILE_FOCUS_DELAY_MS = 450;
const TILE_SIZE = 256;
const GOOGLE_TILE_CACHE_SIZE = 512;
const ROAD_TILE_PATTERN = /!1i(\d+)!2i(\d+)!3i(\d+|VinaFnapurmBegrtn)!/;
const SATELLITE_TILE_PATTERN = /[?&]x=(\d+)&y=(\d+)&z=(\d+|VinaFnapurmBegrtn)/;

const renderers = new Map<string, GoogleMapsJsTileRenderer>();

function getRenderer(options: GoogleMapsJsTileImageryProviderOptions): GoogleMapsJsTileRenderer {
  const key = JSON.stringify({
    mapType: options.mapType,
    styles: options.styles ?? [],
    overlayLayer: options.overlayLayer,
  });
  let renderer = renderers.get(key);
  if (!renderer) {
    renderer = new GoogleMapsJsTileRenderer(options);
    renderers.set(key, renderer);
  }
  return renderer;
}

export class GoogleMapsJsTileImageryProvider {
  public readonly tileWidth = TILE_SIZE;
  public readonly tileHeight = TILE_SIZE;
  public readonly maximumLevel = 21;
  public readonly minimumLevel = 0;
  public readonly tilingScheme = new Cesium.WebMercatorTilingScheme();
  public readonly rectangle = this.tilingScheme.rectangle;
  public readonly tileDiscardPolicy = undefined;
  public readonly errorEvent = new Cesium.Event();
  public readonly proxy = undefined;
  public readonly hasAlphaChannel = true;
  private readonly renderer: GoogleMapsJsTileRenderer;

  constructor(
    options: GoogleMapsJsTileImageryProviderOptions,
    public readonly credit: Cesium.Credit,
  ) {
    this.renderer = getRenderer(options);
  }

  public getTileCredits(): Cesium.Credit[] {
    return [this.credit];
  }

  public requestImage(x: number, y: number, level: number): Promise<ImageryTypes> | undefined {
    return this.renderer.requestTile({ x, y, z: level });
  }

  public pickFeatures(): undefined {
    return undefined;
  }
}

class GoogleMapsJsTileRenderer {
  private readonly cache = new Map<string, string>();
  private readonly pendingTiles = new Map<string, PendingTileGroup>();
  private readonly pendingOrder: string[] = [];
  private container: HTMLDivElement | undefined;
  private map: GoogleMap | undefined;
  private googleMapsPromise: Promise<GoogleMapsNamespace> | undefined;
  private observer: MutationObserver | undefined;
  private pumpScheduled = false;
  private pumping = false;

  constructor(private readonly options: GoogleMapsJsTileImageryProviderOptions) {}

  public async requestTile(coords: TileCoords): Promise<HTMLCanvasElement> {
    const tileKey = tileCoordsToKey(coords);
    const cachedUrl = this.cache.get(tileKey);
    if (cachedUrl) return renderTileUrl(cachedUrl);

    try {
      const url = await new Promise<string>((resolve, reject) => {
        let group = this.pendingTiles.get(tileKey);
        if (!group) {
          group = { coords, waiters: new Set() };
          this.pendingTiles.set(tileKey, group);
          this.pendingOrder.push(tileKey);
        }

        const waiter: PendingTileWaiter = {
          resolve,
          reject,
          timeoutId: window.setTimeout(() => {
            this.removeWaiter(tileKey, waiter);
            reject(new Error(`Timed out waiting for Google Maps tile ${tileKey}`));
          }, TILE_REQUEST_TIMEOUT_MS),
        };

        group.waiters.add(waiter);
        this.schedulePump();
      });
      return await renderTileUrl(url);
    } catch {
      this.forgetTile(tileKey);
      return createTransparentTile();
    }
  }

  private schedulePump(): void {
    if (this.pumpScheduled || this.pumping) return;

    this.pumpScheduled = true;
    window.setTimeout(() => {
      this.pumpScheduled = false;
      this.pumpQueue().then();
    });
  }

  private async pumpQueue(): Promise<void> {
    if (this.pumping) return;

    this.pumping = true;
    try {
      await this.ensureMap();
      while (this.pendingTiles.size > 0) {
        const group = this.nextPendingGroup();
        if (!group) break;
        if (this.resolvePendingTile(group.coords)) continue;

        this.focusTile(group.coords);
        await delay(TILE_FOCUS_DELAY_MS);
        this.resolvePendingTile(group.coords);

        if (this.pendingTiles.has(tileCoordsToKey(group.coords))) {
          this.pendingOrder.push(tileCoordsToKey(group.coords));
        }
      }
    } catch (error) {
      this.rejectPendingTiles(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.pumping = false;
      if (this.pendingTiles.size > 0) this.schedulePump();
    }
  }

  private nextPendingGroup(): PendingTileGroup | undefined {
    while (this.pendingOrder.length > 0) {
      const key = this.pendingOrder.shift();
      if (!key) continue;

      const group = this.pendingTiles.get(key);
      if (group) return group;
    }
  }

  private focusTile(coords: TileCoords): void {
    if (!this.map) return;

    const googleMaps = (safeWindow as WindowWithGoogleMaps).google?.maps;
    if (!googleMaps) return;

    const center = tileCoordsToCenter(coords);
    this.map.setCenter(new googleMaps.LatLng(center.lat, center.lng));
    if (this.map.getZoom() !== coords.z) this.map.setZoom(coords.z);
    googleMaps.event?.trigger(this.map, "resize");
  }

  private async ensureMap(): Promise<void> {
    if (this.map) return;

    const googleMaps = await this.waitForGoogleMaps();
    const container = this.getContainer();

    this.map = new googleMaps.Map(container, {
      center: { lat: 0, lng: 0 },
      zoom: 0,
      tilt: 0,
      mapTypeId: this.options.mapType,
      disableDefaultUI: true,
      keyboardShortcuts: false,
      draggable: false,
      disableDoubleClickZoom: true,
      scrollwheel: false,
      styles: this.options.styles ?? [],
      backgroundColor: "transparent",
    });

    this.addOverlayLayer(googleMaps);
    this.attachObserver(container);
  }

  private addOverlayLayer(googleMaps: GoogleMapsNamespace): void {
    const layerName = this.options.overlayLayer;
    if (!layerName) return;

    const LayerConstructor = googleMaps[layerName];
    if (!LayerConstructor) return;

    new LayerConstructor().setMap(this.map ?? null);
  }

  private waitForGoogleMaps(): Promise<GoogleMapsNamespace> {
    if (this.googleMapsPromise) return this.googleMapsPromise;

    this.googleMapsPromise = new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        const googleMaps = (safeWindow as WindowWithGoogleMaps).google?.maps;
        if (googleMaps?.Map && googleMaps.LatLng) {
          resolve(googleMaps);
          return;
        }

        if (Date.now() - startedAt >= GOOGLE_MAPS_API_TIMEOUT_MS) {
          reject(new Error("The stock Google Maps JavaScript API did not become available."));
          return;
        }

        window.setTimeout(check, 100);
      };

      check();
    });

    return this.googleMapsPromise;
  }

  private getContainer(): HTMLDivElement {
    if (this.container) return this.container;

    const container = document.createElement("div");
    container.classList.add("iitc-next-google-maps-js-tile-renderer");
    container.dataset.mapType = this.options.mapType;
    if (this.options.overlayLayer) container.dataset.overlayLayer = this.options.overlayLayer;
    Object.assign(container.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "1024px",
      height: "1024px",
      overflow: "hidden",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1",
    });

    (document.body ?? document.documentElement).appendChild(container);
    this.container = container;
    return container;
  }

  private attachObserver(container: HTMLElement): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          this.inspectNode(node);
        }
      }
    });
    this.observer.observe(container, { childList: true, subtree: true });
    container.querySelectorAll("img").forEach((image) => this.inspectImage(image));
  }

  private inspectNode(node: Node): void {
    if (isImageElement(node)) {
      this.inspectImage(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    (node as Element).querySelectorAll("img").forEach((image) => this.inspectImage(image));
  }

  private inspectImage(image: HTMLImageElement): void {
    const coords = parseGoogleTileImage(image.src);
    if (!coords) return;

    this.setCachedTileUrl(coords, image.src);
    this.resolvePendingTile(coords);
  }

  private setCachedTileUrl(coords: TileCoords, url: string): void {
    const key = tileCoordsToKey(coords);
    this.cache.delete(key);
    this.cache.set(key, url);

    while (this.cache.size > GOOGLE_TILE_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private resolvePendingTile(coords: TileCoords): boolean {
    const tileKey = tileCoordsToKey(coords);
    const url = this.cache.get(tileKey);
    if (!url) return false;

    const group = this.pendingTiles.get(tileKey);
    if (!group) return true;

    this.pendingTiles.delete(tileKey);
    group.waiters.forEach((waiter) => {
      window.clearTimeout(waiter.timeoutId);
      waiter.resolve(url);
    });
    group.waiters.clear();
    return true;
  }

  private removeWaiter(tileKey: string, waiter: PendingTileWaiter): void {
    const group = this.pendingTiles.get(tileKey);
    if (!group) return;

    group.waiters.delete(waiter);
    if (group.waiters.size === 0) this.pendingTiles.delete(tileKey);
  }

  private rejectPendingTiles(error: Error): void {
    this.pendingTiles.forEach((group) => {
      group.waiters.forEach((waiter) => {
        window.clearTimeout(waiter.timeoutId);
        waiter.reject(error);
      });
    });
    this.pendingTiles.clear();
    this.pendingOrder.splice(0);
  }

  private forgetTile(tileKey: string): void {
    this.cache.delete(tileKey);
  }
}

function parseGoogleTileImage(src: string): TileCoords | undefined {
  let match = src.match(ROAD_TILE_PATTERN);
  if (match) {
    return parseTileCoords(match[2], match[3], match[1]);
  }

  match = src.match(SATELLITE_TILE_PATTERN);
  if (match) {
    return parseTileCoords(match[1], match[2], match[3]);
  }
}

function parseTileCoords(xText: string, yText: string, zText: string): TileCoords | undefined {
  const x = Number(xText);
  const y = Number(yText);
  const z = Number(zText);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return undefined;
  return { x, y, z };
}

function tileCoordsToCenter(coords: TileCoords): { lat: number; lng: number } {
  const tileCount = 2 ** coords.z;
  const lng = ((coords.x + 0.5) / tileCount) * 360 - 180;
  const mercatorY = Math.PI * (1 - 2 * ((coords.y + 0.5) / tileCount));
  const lat = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
  return { lat, lng };
}

function tileCoordsToKey(coords: TileCoords): string {
  return `${coords.z}/${coords.x}/${coords.y}`;
}

async function renderTileUrl(url: string): Promise<HTMLCanvasElement> {
  const canvas = createTransparentTile();

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a 2D canvas context for a Google Maps tile.");

  const loadedImage = await loadTileImage(url);
  try {
    context.drawImage(loadedImage.image, 0, 0, TILE_SIZE, TILE_SIZE);
  } finally {
    loadedImage.release?.();
  }

  return canvas;
}

function createTransparentTile(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  return canvas;
}

async function loadTileImage(url: string): Promise<LoadedTileImage> {
  try {
    return { image: await loadImage(url, "anonymous") };
  } catch {
    const blob = await loadTileBlobWithUserscript(url);
    const image = await createImageBitmap(blob);
    return {
      image,
      release: () => image.close(),
    };
  }
}

function loadImage(url: string, crossOrigin?: "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = crossOrigin;
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load Google Maps tile image: ${url}`));
    image.src = url;
  });
}

function loadTileBlobWithUserscript(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const userscriptRequest = GM_xmlhttpRequest as typeof GM_xmlhttpRequest | undefined;
    if (!userscriptRequest) {
      reject(new Error("GM_xmlhttpRequest is not available for Google Maps tile loading."));
      return;
    }

    userscriptRequest<"blob">({
      method: "GET",
      url,
      responseType: "blob",
      anonymous: true,
      timeout: 15_000,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300 && isBlob(response.response)) {
          resolve(response.response);
        } else {
          reject(new Error(`Failed to fetch Google Maps tile image: ${response.status}`));
        }
      },
      onerror: () => reject(new Error("Failed to fetch Google Maps tile image.")),
      ontimeout: () => reject(new Error("Timed out fetching Google Maps tile image.")),
    });
  });
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob || Object.prototype.toString.call(value) === "[object Blob]";
}

function isImageElement(node: Node): node is HTMLImageElement {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === "img";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
