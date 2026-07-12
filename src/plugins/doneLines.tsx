/**
 * Done Lines plugin for IITC Next
 *
 * Highlight done lines drawn by the draw lines plugin.
 * safeWindow is provided for access to the IITC Next core components.
 */

import "../types/iitc/iitc.ts";
import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc/iitc.ts";
import type { LinkData } from "../types/iitc/link.ts";
import { safeWindow } from "../utils/window";
import {
  DRAW_LINES_PLUGIN_ID,
  isDrawLinesAppearanceController,
  isDrawLinesReader,
  type DrawLineAppearanceOverride,
  type DrawLinesAppearanceController,
  type DrawLinesReader,
} from "./drawLines/api";

const LOG_TAG = "DoneLinesPlugin";
const DONE_LINES_PLUGIN_ID = "done-lines";
const DONE_LINE_APPEARANCE_OVERRIDE: DrawLineAppearanceOverride = {
  alpha: 1,
  width: 4,
  dashLength: 6,
};
const POSITION_EPSILON = 1e-6;

type Segment = [Point, Point];

interface Point {
  lng: number;
  lat: number;
}

interface DrawLineSegment {
  lineId: string;
  segment: Segment;
}

class DoneLinesPlugin {
  public id = DONE_LINES_PLUGIN_ID;
  public name = "Done Lines";
  public description = "Highlight draw lines that match existing map links.";

  private logManager!: NonNullable<IITCCore["logManager"]>;
  private linkManager!: NonNullable<IITCCore["linkManager"]>;
  private drawLinesReader!: DrawLinesReader;
  private drawLinesAppearanceController!: DrawLinesAppearanceController;

  private updateFrame: number | undefined;
  private linksChangedCallback = () => this.scheduleUpdate();
  private drawLinesChangedListener = () => this.scheduleUpdate();

  public init() {
    const iitc: IITCCore = safeWindow.iitc;
    this.logManager = iitc.logManager!;
    this.linkManager = iitc.linkManager!;
    const drawLinesPlugin = iitc.pluginManager?.getPlugin(DRAW_LINES_PLUGIN_ID);

    if (
      !this.logManager ||
      !this.linkManager ||
      !isDrawLinesReader(drawLinesPlugin) ||
      !isDrawLinesAppearanceController(drawLinesPlugin)
    ) {
      console.warn(`[WARN][${LOG_TAG}] IITC Next core components missing`, {
        logManager: !!this.logManager,
        linkManager: !!this.linkManager,
        drawLinesReader: isDrawLinesReader(drawLinesPlugin),
        drawLinesAppearanceController: isDrawLinesAppearanceController(drawLinesPlugin),
      });
      return;
    }
    this.drawLinesReader = drawLinesPlugin;
    this.drawLinesAppearanceController = drawLinesPlugin;

    try {
      this.linkManager.addLinksChangedCallback(this.linksChangedCallback);
      this.drawLinesReader.addDrawLinesChangedListener(this.drawLinesChangedListener);
      this.scheduleUpdate();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize done lines plugin", e);
    }
  }

  public deinit() {
    try {
      if (this.updateFrame !== undefined) window.cancelAnimationFrame(this.updateFrame);
      this.updateFrame = undefined;
      this.linkManager?.removeLinksChangedCallback(this.linksChangedCallback);
      this.drawLinesReader?.removeDrawLinesChangedListener(this.drawLinesChangedListener);
      this.drawLinesAppearanceController?.clearAppearanceOverrides(DONE_LINES_PLUGIN_ID);
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize done lines plugin", e);
    }
  }

  private scheduleUpdate() {
    if (this.updateFrame !== undefined) return;

    this.updateFrame = window.requestAnimationFrame(() => {
      this.updateFrame = undefined;
      this.updateAppearanceOverrides();
    });
  }

  private updateAppearanceOverrides() {
    const drawLineSegments = this.getDrawLineSegments();
    if (drawLineSegments.length === 0) {
      this.drawLinesAppearanceController.setAppearanceOverrides(DONE_LINES_PLUGIN_ID, new Map());
      return;
    }

    const linkSegments = this.getLinkSegments();
    const appearanceOverrides = new Map<string, DrawLineAppearanceOverride>();

    drawLineSegments.forEach(drawLine => {
      if (linkSegments.some(link => this.segmentsMatch(drawLine.segment, link))) {
        appearanceOverrides.set(drawLine.lineId, DONE_LINE_APPEARANCE_OVERRIDE);
      }
    });

    this.drawLinesAppearanceController.setAppearanceOverrides(DONE_LINES_PLUGIN_ID, appearanceOverrides);
  }

  private getDrawLineSegments(): DrawLineSegment[] {
    const segments: DrawLineSegment[] = [];

    this.drawLinesReader.forEachDrawLineData(line => {
      if (line.positions.length < 2) return;

      for (let i = 0; i < line.positions.length - 1; i++) {
        const a = this.toPoint(line.positions[i]);
        const b = this.toPoint(line.positions[i + 1]);
        if (a && b) segments.push({ lineId: line.id, segment: [a, b] });
      }
    });
    return segments;
  }

  private getLinkSegments(): Segment[] {
    const segments: Segment[] = [];

    this.linkManager.forEachLinkData(link => {
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
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new DoneLinesPlugin());
  } else {
    window.setTimeout(register, 1000);
  }
};

register();
