/**
 * Done lines plugin for IITC Next
 *
 * Highlight done lines drawn by the draw lines plugin.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc/iitc.ts";
import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc/iitc.ts";
import type { LinkData } from "../types/iitc/link.ts";
import { safeWindow } from "../utils/window";

const LOG_TAG = "DoneLinesPlugin";

// Done Lines doesn't have its own layer
const DRAW_LINES_LAYER_NAME = "Draw Lines";

const HIGHLIGHT_WIDTH = 4;
const DASH_LENGTH = 6;
const POSITION_EPSILON = 1e-6;

type Segment = [Point, Point];

interface Point {
  lng: number;
  lat: number;
}

interface LineStyle {
  material: Cesium.MaterialProperty;
  width: Cesium.Property | undefined;
  doneMaterial?: Cesium.PolylineDashMaterialProperty;
}

interface DrawLineSegment {
  entity: Cesium.Entity;
  segment: Segment;
}

class DoneLinesPlugin {
  public id = "done-lines";
  public name = "Done Lines";
  public description = "Highlight draw lines that match existing map links.";

  private viewer!: NonNullable<IITCCore["viewer"]>;
  private logManager!: NonNullable<IITCCore["logManager"]>;
  private layerManager!: NonNullable<IITCCore["layerManager"]>;
  private linkEntityManager!: NonNullable<IITCCore["linkEntityManager"]>;

  private drawLinesSource: Cesium.DataSource | undefined;
  private updateQueued = false;
  private trackedSources: Set<Cesium.DataSource> = new Set();
  private originalLineStyles: Map<Cesium.Entity, LineStyle> = new Map();
  private linksChangedListener = () => this.scheduleUpdate();
  private entityCollectionChangedListener: Cesium.EntityCollection.CollectionChangedEventCallback = (_collection, _added, removed) => {
    removed.forEach(entity => this.restoreLineStyle(entity));
    this.scheduleUpdate();
  };
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
      this.viewer.dataSources.dataSourceAdded.addEventListener(this.dataSourceAddedListener);
      this.viewer.dataSources.dataSourceRemoved.addEventListener(this.dataSourceRemovedListener);
      this.trackSource(this.drawLinesSource);
      this.forEachDataSource(source => this.trackSource(source));
      this.linkEntityManager.addLinksChangedListener(this.linksChangedListener);
      this.scheduleUpdate();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize done lines plugin", e);
    }
  }

  public deinit() {
    try {
      this.viewer?.dataSources.dataSourceAdded.removeEventListener(this.dataSourceAddedListener);
      this.viewer?.dataSources.dataSourceRemoved.removeEventListener(this.dataSourceRemovedListener);
      this.linkEntityManager?.removeLinksChangedListener(this.linksChangedListener);
      this.trackedSources.forEach(source => this.untrackSource(source));
      this.trackedSources.clear();
      this.restoreAllLineStyles();
      this.drawLinesSource = undefined;
      this.updateQueued = false;
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize done lines plugin", e);
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

    if (source.name === DRAW_LINES_LAYER_NAME) {
      source.entities.values.forEach(entity => this.restoreLineStyle(entity));
      if (this.drawLinesSource === source) this.drawLinesSource = undefined;
    }
    source.entities.collectionChanged.removeEventListener(this.entityCollectionChangedListener);
    this.trackedSources.delete(source);
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
    if (!this.viewer) return;

    const drawLineSegments = this.getDrawLineSegments();
    if (drawLineSegments.length === 0) {
      this.restoreAllLineStyles();
      this.viewer.scene.requestRender();
      return;
    }

    const linkSegments = this.getLinkSegments();
    const doneLines = new Set<Cesium.Entity>();

    drawLineSegments.forEach(drawLine => {
      if (linkSegments.some(link => this.segmentsMatch(drawLine.segment, link))) {
        doneLines.add(drawLine.entity);
      }
    });

    this.originalLineStyles.forEach((_, line) => {
      if (!doneLines.has(line)) this.restoreLineStyle(line);
    });
    doneLines.forEach(line => this.applyDoneStyle(line));

    this.viewer.scene.requestRender();
  }

  private getDrawLineSegments(): DrawLineSegment[] {
    const segments: DrawLineSegment[] = [];

    this.drawLinesSource?.entities.values.forEach(entity => {
      const positions = entity.polyline?.positions?.getValue(Cesium.JulianDate.now()) as Cesium.Cartesian3[] | undefined;
      if (!positions || positions.length < 2) return;

      for (let i = 0; i < positions.length - 1; i++) {
        const a = this.toPoint(positions[i]);
        const b = this.toPoint(positions[i + 1]);
        if (a && b) segments.push({ entity, segment: [a, b] });
      }
    });
    return segments;
  }

  private getLinkSegments(): Segment[] {
    const segments: Segment[] = [];

    this.linkEntityManager.forEachLinkData(link => {
      const segment = this.getLinkSegment(link);
      segments.push(segment);
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

  private segmentsMatch(a: Segment, b: Segment): boolean {
    return (
      this.pointsMatch(a[0], b[0]) && this.pointsMatch(a[1], b[1])
    ) || (
      this.pointsMatch(a[0], b[1]) && this.pointsMatch(a[1], b[0])
    );
  }

  private pointsMatch(a: Point, b: Point): boolean {
    return Math.abs(a.lng - b.lng) <= POSITION_EPSILON &&
      Math.abs(a.lat - b.lat) <= POSITION_EPSILON;
  }

  private applyDoneStyle(line: Cesium.Entity) {
    if (!line.polyline) return;

    const currentMaterial = line.polyline.material;
    const currentWidth = line.polyline.width;
    const existingStyle = this.originalLineStyles.get(line);
    if (existingStyle && currentMaterial === existingStyle.doneMaterial) return;

    const materialChangedExternally = existingStyle && currentMaterial !== existingStyle.doneMaterial;
    const originalStyle = existingStyle && !materialChangedExternally
      ? existingStyle
      : {
        material: currentMaterial,
        width: currentWidth,
      };
    const doneMaterial = new Cesium.PolylineDashMaterialProperty({
      color: this.getMaterialColor(originalStyle.material).withAlpha(1),
      dashLength: DASH_LENGTH,
    });

    this.originalLineStyles.set(line, {
      ...originalStyle,
      doneMaterial,
    });
    line.polyline.material = doneMaterial;
    line.polyline.width = new Cesium.ConstantProperty(HIGHLIGHT_WIDTH);
  }

  private restoreAllLineStyles() {
    Array.from(this.originalLineStyles.keys()).forEach(line => this.restoreLineStyle(line));
  }

  private restoreLineStyle(line: Cesium.Entity) {
    const originalStyle = this.originalLineStyles.get(line);
    if (!originalStyle || !line.polyline) return;

    line.polyline.material = originalStyle.material;
    line.polyline.width = originalStyle.width;
    this.originalLineStyles.delete(line);
  }

  private getMaterialColor(material: Cesium.MaterialProperty): Cesium.Color {
    const now = Cesium.JulianDate.now();
    const colorProperty = material instanceof Cesium.ColorMaterialProperty
      ? material.color
      : undefined;
    const color = colorProperty?.getValue(now);

    return color instanceof Cesium.Color ? color : Cesium.Color.WHITE;
  }
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new DoneLinesPlugin());
  } else {
    window.setTimeout(register, 1000);
  }
};

register();
