/**
 * Adapts Gaode traffic tiles into a Cesium imagery provider.
 *
 * Gaode's traffic endpoint does not return CORS headers. Cesium must upload
 * imagery into WebGL textures, and WebGL rejects cross-origin image pixels unless
 * the image is CORS-clean. This provider fetches the tile bytes through the
 * userscript request API, decodes them from a local blob, and hands Cesium
 * texture-safe imagery without touching the tainted cross-origin image path.
 */

import * as Cesium from "cesium";
import { GM_xmlhttpRequest } from "vite-plugin-monkey/dist/client";
import { AmapMercatorTilingScheme } from "../../utils/map.ts";

type UserscriptWindow = Window & {
  GM?: {
    xmlHttpRequest?: typeof GM_xmlhttpRequest,
  },
  GM_xmlhttpRequest?: typeof GM_xmlhttpRequest,
};

type TrafficRequest = Omit<Cesium.Request, "cancelFunction" | "requestFunction"> & {
  cancelFunction?: () => void,
  requestFunction: () => Promise<Cesium.ImageryTypes>,
};

type TrafficRequestScheduler = typeof Cesium.RequestScheduler & {
  request: (request: TrafficRequest) => Promise<Cesium.ImageryTypes> | undefined,
};

const TILE_SIZE = 256;
const TRAFFIC_TILE_MINIMUM_DATA_LEVEL = 6;
const TRAFFIC_TILE_LOAD_TIMEOUT_MS = 8_000;
const TRAFFIC_TILE_RETRY_ATTEMPTS = 2;

export class GaodeTrafficImageryProvider {
  public readonly tileWidth = TILE_SIZE;
  public readonly tileHeight = TILE_SIZE;
  public readonly maximumLevel = 17;
  public readonly minimumLevel = 0;
  public readonly tilingScheme = new AmapMercatorTilingScheme({});
  public readonly rectangle = this.tilingScheme.rectangle;
  public readonly tileDiscardPolicy = undefined;
  public readonly errorEvent = new Cesium.Event();
  public readonly proxy = undefined;
  public readonly hasAlphaChannel = true;

  public constructor(public readonly credit: Cesium.Credit) {
    this.errorEvent.addEventListener((error: Cesium.TileProviderError) => {
      error.retry = error.timesRetried < TRAFFIC_TILE_RETRY_ATTEMPTS;
    });
  }

  public getTileCredits(): Cesium.Credit[] {
    return [this.credit];
  }

  public requestImage(x: number, y: number, level: number, request?: Cesium.Request): Promise<Cesium.ImageryTypes> | undefined {
    if (level < TRAFFIC_TILE_MINIMUM_DATA_LEVEL || level > this.maximumLevel) return Promise.resolve(createTransparentTile());

    const url = buildGaodeTrafficUrl(x, y, level);
    if (!request) return loadGaodeTrafficTile(url);

    const trafficRequest = request as unknown as TrafficRequest;
    trafficRequest.url = url;
    trafficRequest.requestFunction = () => loadGaodeTrafficTile(url, trafficRequest);
    return (Cesium.RequestScheduler as TrafficRequestScheduler).request(trafficRequest);
  }

  public pickFeatures(): undefined {
    return undefined;
  }
}

function buildGaodeTrafficUrl(x: number, y: number, level: number): string {
  const url = new URL("https://tm.amap.com/trafficengine/mapabc/traffictile");
  url.searchParams.set("v", "1.0");
  url.searchParams.set("t", "1");
  url.searchParams.set("z", String(level));
  url.searchParams.set("y", String(y));
  url.searchParams.set("x", String(x));
  url.searchParams.set("time", String(Date.now()));
  return url.toString();
}

async function loadGaodeTrafficTile(url: string, request?: TrafficRequest): Promise<Cesium.ImageryTypes> {
  const blob = await loadTileBlobWithUserscript(url, request);
  return createImageBitmap(blob, {
    imageOrientation: "flipY",
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
}

function loadTileBlobWithUserscript(url: string, request?: TrafficRequest): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const userscriptRequest = getUserscriptXmlHttpRequest();
    if (!userscriptRequest) {
      reject(new Error("GM_xmlhttpRequest is not available for Gaode traffic tile loading."));
      return;
    }

    let settled = false;
    const requestHandle: { current?: ReturnType<typeof userscriptRequest> } = {};
    const previousCancelFunction = request?.cancelFunction;
    const cancelFunction = (): void => {
      previousCancelFunction?.();
      requestHandle.current?.abort();
      settle(() => reject(new Error("Cancelled Gaode traffic tile image loading.")));
    };

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (request?.cancelFunction === cancelFunction) request.cancelFunction = previousCancelFunction;
      callback();
    };

    const timeoutId = window.setTimeout(() => {
      requestHandle.current?.abort();
      settle(() => reject(new Error("Timed out fetching Gaode traffic tile image.")));
    }, TRAFFIC_TILE_LOAD_TIMEOUT_MS);

    if (request) request.cancelFunction = cancelFunction;

    requestHandle.current = userscriptRequest<"blob">({
      method: "GET",
      url,
      responseType: "blob",
      anonymous: true,
      timeout: TRAFFIC_TILE_LOAD_TIMEOUT_MS,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300 && isBlob(response.response)) {
          settle(() => resolve(response.response));
        } else {
          settle(() => reject(new Error(`Failed to fetch Gaode traffic tile image: ${response.status}`)));
        }
      },
      onerror: () => settle(() => reject(new Error("Failed to fetch Gaode traffic tile image."))),
      ontimeout: () => settle(() => reject(new Error("Timed out fetching Gaode traffic tile image."))),
    });
  });
}

function getUserscriptXmlHttpRequest(): typeof GM_xmlhttpRequest | undefined {
  if (typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;

  const userscriptWindow = getUserscriptWindow();
  if (typeof userscriptWindow?.GM_xmlhttpRequest === "function") {
    return userscriptWindow.GM_xmlhttpRequest;
  }

  if (typeof userscriptWindow?.GM?.xmlHttpRequest === "function") {
    return userscriptWindow.GM.xmlHttpRequest as typeof GM_xmlhttpRequest;
  }

  return undefined;
}

function getUserscriptWindow(): UserscriptWindow | undefined {
  for (const key of Object.getOwnPropertyNames(document)) {
    if (!key.startsWith("__monkeyWindow-")) continue;

    const value = (document as unknown as Record<string, unknown>)[key];
    if (typeof value === "object" && value !== null) return value as UserscriptWindow;
  }

  return undefined;
}

function createTransparentTile(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  return canvas;
}

function isBlob(value: unknown): value is Blob {
  return value instanceof Blob || Object.prototype.toString.call(value) === "[object Blob]";
}
