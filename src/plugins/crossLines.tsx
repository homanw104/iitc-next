/**
 * Cross line plugin for IITC Next
 *
 * This plugin will highlight crossed links from the draw lines plugin.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc/iitc.ts";
import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc/iitc.ts";
import type { LinkData } from "../types/iitc/link.ts";
import { safeWindow } from "../utils/window";

const LOG_TAG = "CrossLinesPlugin";
const DRAW_LINES_LAYER_NAME = "Draw Lines";
const CROSS_LINES_LAYER_NAME = "Cross Lines";
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

  private viewer!: NonNullable<IITCCore["viewer"]>;
  private logManager!: NonNullable<IITCCore["logManager"]>;
  private layerManager!: NonNullable<IITCCore["layerManager"]>;
  private linkEntityManager!: NonNullable<IITCCore["linkEntityManager"]>;

  private drawLinesSource: Cesium.DataSource | undefined;
  private highlightSource: Cesium.DataSource | undefined;
  private updateQueued = false;
  private trackedSources: Set<Cesium.DataSource> = new Set();
  private linksChangedListener = () => this.scheduleUpdate();
  private entityCollectionChangedListener: Cesium.EntityCollection.CollectionChangedEventCallback = () => this.scheduleUpdate();
  private dataSourceAddedListener = (source: Cesium.DataSource) => this.trackSource(source);
  private dataSourceRemovedListener = (source: Cesium.DataSource) => this.untrackSource(source);

  public init() {
    const iitc: IITCCore = safeWindow.iitc;
    this.viewer = iitc.viewer!;
    this.logManager = iitc.logManager!;
    this.layerManager = iitc.layerManager!;
    this.linkEntityManager = iitc.linkEntityManager!;

    if (!this.viewer || !this.logManager || !this.layerManager || !this.linkEntityManager) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        linkEntityManager: !!this.linkEntityManager,
      });
      return;
    }

    try {
      this.drawLinesSource = this.layerManager.getOrCreateDataSource(DRAW_LINES_LAYER_NAME);
      this.highlightSource = this.layerManager.getOrCreateDataSource(CROSS_LINES_LAYER_NAME);
      this.viewer.dataSources.dataSourceAdded.addEventListener(this.dataSourceAddedListener);
      this.viewer.dataSources.dataSourceRemoved.addEventListener(this.dataSourceRemovedListener);
      this.trackSource(this.drawLinesSource);
      this.forEachDataSource(source => this.trackSource(source));
      this.linkEntityManager.addLinksChangedListener(this.linksChangedListener);
      this.scheduleUpdate();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize cross lines plugin", e);
    }
  }

  public deinit() {
    try {
      this.viewer?.dataSources.dataSourceAdded.removeEventListener(this.dataSourceAddedListener);
      this.viewer?.dataSources.dataSourceRemoved.removeEventListener(this.dataSourceRemovedListener);
      this.linkEntityManager?.removeLinksChangedListener(this.linksChangedListener);
      this.trackedSources.forEach(source => this.untrackSource(source));
      this.trackedSources.clear();
      this.layerManager.removeDataSourceLayer(CROSS_LINES_LAYER_NAME);
      this.highlightSource = undefined;
      this.drawLinesSource = undefined;
      this.updateQueued = false;
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize cross lines plugin", e);
    }
  }

  private forEachDataSource(callback: (source: Cesium.DataSource) => void) {
    if (!this.viewer) return;

    const sources = this.viewer.dataSources;
    for (let i = 0; i < sources.length; i++) {
      callback(sources.get(i));
    }
  }

  private trackSource(source: Cesium.DataSource) {
    if (!this.isRelevantSource(source) || this.trackedSources.has(source)) return;

    if (source.name === DRAW_LINES_LAYER_NAME) this.drawLinesSource = source;
    source.entities.collectionChanged.addEventListener(this.entityCollectionChangedListener);
    this.trackedSources.add(source);
    this.scheduleUpdate();
  }

  private untrackSource(source: Cesium.DataSource) {
    if (!this.trackedSources.has(source)) return;

    source.entities.collectionChanged.removeEventListener(this.entityCollectionChangedListener);
    this.trackedSources.delete(source);
    if (this.drawLinesSource === source) this.drawLinesSource = undefined;
    this.scheduleUpdate();
  }

  private isRelevantSource(source: Cesium.DataSource): boolean {
    return source.name === DRAW_LINES_LAYER_NAME;
  }

  private scheduleUpdate() {
    if (this.updateQueued) return;

    this.updateQueued = true;
    window.requestAnimationFrame(() => {
      this.updateQueued = false;
      this.updateHighlights();
    });
  }

  private updateHighlights() {
    if (!this.viewer || !this.highlightSource) return;

    this.highlightSource.entities.removeAll();

    const drawLineSegments = this.getDrawLineSegments();
    if (drawLineSegments.length === 0) {
      this.viewer.scene.requestRender();
      return;
    }

    this.linkEntityManager.forEachLinkData(link => {
      const linkSegment = this.getLinkSegment(link);

      const isCrossed = drawLineSegments.some(drawLine => this.segmentsIntersect(drawLine[0], drawLine[1], linkSegment[0], linkSegment[1]));
      if (!isCrossed) return;

      this.highlightSource?.entities.add({
        id: `cross-lines-${link.guid}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            link.oLngE6 / 1e6,
            link.oLatE6 / 1e6,
            link.dLngE6 / 1e6,
            link.dLatE6 / 1e6,
          ]),
          width: HIGHLIGHT_WIDTH,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(HIGHLIGHT_COLOR).withAlpha(1),
            dashLength: DASH_LENGTH,
          }),
          arcType: Cesium.ArcType.GEODESIC,
          clampToGround: true,
        },
      });
    });

    this.viewer.scene.requestRender();
  }

  private getDrawLineSegments(): Segment[] {
    const segments: Segment[] = [];

    this.drawLinesSource?.entities.values.forEach(entity => {
      const positions = entity.polyline?.positions?.getValue(Cesium.JulianDate.now()) as Cesium.Cartesian3[] | undefined;
      if (!positions || positions.length < 2) return;

      for (let i = 0; i < positions.length - 1; i++) {
        const a = this.toPoint(positions[i]);
        const b = this.toPoint(positions[i + 1]);
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
