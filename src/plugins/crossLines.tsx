/**
 * Cross Lines plugin for IITC Next
 *
 * This plugin will highlight crossed links from the draw lines plugin.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc/iitc.ts";
import * as Cesium from "cesium";
import type { LayerGroundPrimitives } from "../managers/layer/layerGroundPrimitives";
import type { IITCCore } from "../types/iitc/iitc.ts";
import type { LinkData } from "../types/iitc/link.ts";
import { safeWindow } from "../utils/window";
import {
  DRAW_LINES_PLUGIN_ID,
  isDrawLinesReader,
  type DrawLinesReader,
} from "./drawLines/api";

const LOG_TAG = "CrossLinesPlugin";
const CROSS_LINES_LAYER_NAME = "Cross Lines";
const CROSS_LINES_PRIMITIVE_KEY = "crossed-links";
const CROSS_LINES_PRIMITIVE_Z_INDEX = 110;
const HIGHLIGHT_COLOR = "#ff0000";
const HIGHLIGHT_WIDTH = 4;
const DASH_LENGTH = 16;
const EPSILON = 1e-10;

type Segment = [Point, Point];

interface Point {
  lng: number;
  lat: number;
}

class CrossLinesPlugin {
  public id = "cross-lines";
  public name = "Cross Lines";
  public description = "Highlight crossed links from the draw lines plugin.";

  private logManager!: NonNullable<IITCCore["logManager"]>;
  private layerManager!: NonNullable<IITCCore["layerManager"]>;
  private linkManager!: NonNullable<IITCCore["linkManager"]>;
  private drawLinesReader!: DrawLinesReader;

  private highlightLayer: LayerGroundPrimitives | undefined;
  private updateFrame: number | undefined;
  private linksChangedCallback = () => this.scheduleUpdate();
  private drawLinesChangedListener = () => this.scheduleUpdate();

  public init() {
    const iitc: IITCCore = safeWindow.iitc;
    this.logManager = iitc.logManager!;
    this.layerManager = iitc.layerManager!;
    this.linkManager = iitc.linkManager!;
    const drawLinesPlugin = iitc.pluginManager?.getPlugin(DRAW_LINES_PLUGIN_ID);

    if (!this.logManager || !this.layerManager || !this.linkManager || !isDrawLinesReader(drawLinesPlugin)) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        linkManager: !!this.linkManager,
        drawLinesReader: isDrawLinesReader(drawLinesPlugin),
      });
      return;
    }
    this.drawLinesReader = drawLinesPlugin;

    try {
      this.highlightLayer = this.layerManager.getOrCreateGroundPrimitiveLayer(CROSS_LINES_LAYER_NAME, CROSS_LINES_PRIMITIVE_Z_INDEX);
      this.linkManager.addLinksChangedCallback(this.linksChangedCallback);
      this.drawLinesReader.addDrawLinesChangedListener(this.drawLinesChangedListener);
      this.scheduleUpdate();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize cross lines plugin", e);
    }
  }

  public deinit() {
    try {
      if (this.updateFrame !== undefined) window.cancelAnimationFrame(this.updateFrame);
      this.updateFrame = undefined;
      this.linkManager?.removeLinksChangedCallback(this.linksChangedCallback);
      this.drawLinesReader?.removeDrawLinesChangedListener(this.drawLinesChangedListener);
      this.layerManager.removeGroundPrimitiveLayer(CROSS_LINES_LAYER_NAME);
      this.highlightLayer = undefined;
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize cross lines plugin", e);
    }
  }

  private scheduleUpdate() {
    if (this.updateFrame !== undefined) return;

    this.updateFrame = window.requestAnimationFrame(() => {
      this.updateFrame = undefined;
      this.updateHighlights();
    });
  }

  private updateHighlights() {
    if (!this.highlightLayer) return;

    const drawLineSegments = this.getDrawLineSegments();
    if (drawLineSegments.length === 0) {
      this.highlightLayer.removeManagedPrimitive(CROSS_LINES_PRIMITIVE_KEY);
      return;
    }

    const geometryInstances: Cesium.GeometryInstance[] = [];
    this.linkManager.forEachLinkData(link => {
      const linkSegment = this.getLinkSegment(link);

      const isCrossed = drawLineSegments.some(drawLine => this.segmentsIntersect(drawLine[0], drawLine[1], linkSegment[0], linkSegment[1]));
      if (!isCrossed) return;

      geometryInstances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray([
            link.oLngE6 / 1e6,
            link.oLatE6 / 1e6,
            link.dLngE6 / 1e6,
            link.dLatE6 / 1e6,
          ]),
          width: HIGHLIGHT_WIDTH,
          arcType: Cesium.ArcType.GEODESIC,
        }),
      }));
    });

    if (geometryInstances.length === 0) {
      this.highlightLayer.removeManagedPrimitive(CROSS_LINES_PRIMITIVE_KEY);
    } else {
      this.highlightLayer.replacePrimitiveWhenReady(CROSS_LINES_PRIMITIVE_KEY, new Cesium.GroundPolylinePrimitive({
        geometryInstances,
        appearance: new Cesium.PolylineMaterialAppearance({
          material: Cesium.Material.fromType(Cesium.Material.PolylineDashType, {
            color: Cesium.Color.fromCssColorString(HIGHLIGHT_COLOR),
            dashLength: DASH_LENGTH,
          }),
          translucent: false,
        }),
        allowPicking: false,
        asynchronous: true,
        classificationType: Cesium.ClassificationType.BOTH,
      }));
    }
  }

  private getDrawLineSegments(): Segment[] {
    const segments: Segment[] = [];

    this.drawLinesReader.forEachDrawLineData(line => {
      if (line.positions.length < 2) return;

      for (let i = 0; i < line.positions.length - 1; i++) {
        const a = this.toPoint(line.positions[i]);
        const b = this.toPoint(line.positions[i + 1]);
        if (a && b) segments.push([a, b]);
      }
    });

    return segments;
  }

  private getLinkSegment(link: LinkData): Segment {
    return [
      { lng: link.oLngE6 / 1e6, lat: link.oLatE6 / 1e6 },
      { lng: link.dLngE6 / 1e6, lat: link.dLatE6 / 1e6 },
    ];
  }

  private toPoint(position: Cesium.Cartesian3): Point | undefined {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    if (!cartographic) return;

    return {
      lng: Cesium.Math.toDegrees(cartographic.longitude),
      lat: Cesium.Math.toDegrees(cartographic.latitude),
    };
  }

  private segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const abC = this.orientation(a, b, c);
    const abD = this.orientation(a, b, d);
    const cdA = this.orientation(c, d, a);
    const cdB = this.orientation(c, d, b);

    return this.sign(abC) * this.sign(abD) < 0 &&
      this.sign(cdA) * this.sign(cdB) < 0;
  }

  private orientation(a: Point, b: Point, c: Point): number {
    return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  }

  private sign(value: number): number {
    if (Math.abs(value) <= EPSILON) return 0;

    return value > 0 ? 1 : -1;
  }
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new CrossLinesPlugin());
  } else {
    window.setTimeout(register, 1000);
  }
};

register();
