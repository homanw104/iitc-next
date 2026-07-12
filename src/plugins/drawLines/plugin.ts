/**
 * Draw line plugin for IITC Next
 *
 * This plugin enables you to draw lines on the map.
 */

import "../../types/iitc/iitc.ts";
import * as Cesium from "cesium";
import { pickGestureSurfacePosition as pickSceneSurfacePosition } from "../../cesium/interaction/camera/cameraGestures";
import { restoreSceneAfterPick } from "../../cesium/interaction/picking/restoreSceneAfterPick.ts";
import type { GroundPrimitivesLayer } from "../../managers/layer/groundPrimitivesLayer";
import type { OverlayLayer } from "../../managers/layer/overlayLayer";
import { isPortalPrimitiveId } from "../../managers/entity/portalManager.ts";
import type { IITCCore } from "../../types/iitc/iitc.ts";
import { safeLocalStorage } from "../../utils/storage.ts";
import { safeWindow } from "../../utils/window";
import {
  DRAW_LINES_PLUGIN_ID,
  type DrawLineAppearanceOverride,
  type DrawLineData,
  type DrawLinesChangedCallback,
  type DrawLinesAppearanceController,
  type DrawLinesReader,
} from "./api";
import { ClearLinesButton } from "./ClearLinesButton";
import { ConfirmPane } from "./ConfirmPane";
import { DeleteLinesButton } from "./DeleteLinesButton";
import { DrawLinesButton } from "./DrawLinesButton";
import { ExportLinesButton } from "./ExportLinesButton";
import { ImportLinesButton } from "./ImportLinesButton";

const LOG_TAG = "DrawLines";
const LINES_LAYER_NAME = "Draw Lines";
const LINE_MARKERS_LAYER_NAME = "Draw Lines Markers";
const STORAGE_KEY = "iitc-next-draw-lines";
const PREVIEW_COLOR = "#cc823f";
const LINE_COLOR = "#fa8525";
const LINE_ALPHA = 0.8;
const LINE_WIDTH = 3;
const DRAW_LINES_PRIMITIVE_Z_INDEX = 100;
const LINES_PRIMITIVE_KEY = "lines";
const LINE_MARKER_SIZE_PX = 12;
const LINE_MARKER_FILL_COLOR = "#ffffff";
const LINE_MARKER_BORDER_COLOR = "#4a4a4a";
const LINE_MARKER_TIMEOUT_MS = 400;
const TOUCH_GESTURE_MOVE_THRESHOLD_PX = 8;
const TOUCH_GESTURE_IGNORE_MS = 450;
const TOUCH_EVENT_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

interface TouchStartPosition {
  x: number;
  y: number;
}

interface LineMarkerPrimitiveId {
  type: "draw-line-marker";
  marker: "start" | "end";
}

interface DrawLinePrimitiveId {
  type: "draw-line";
  lineId: string;
}

interface DrawLine {
  data: DrawLineData;
  primitiveId: DrawLinePrimitiveId;
}

interface DrawLineAppearance {
  color: string;
  alpha: number;
  width: number;
  dashLength?: number;
}

interface DrawLinePrimitiveGroup {
  appearance: DrawLineAppearance;
  geometryInstances: Cesium.GeometryInstance[];
}

const DEFAULT_LINE_APPEARANCE: DrawLineAppearance = {
  color: LINE_COLOR,
  alpha: LINE_ALPHA,
  width: LINE_WIDTH,
};

class DrawLinesPlugin implements DrawLinesReader, DrawLinesAppearanceController {
  public id = DRAW_LINES_PLUGIN_ID;
  public name = "Draw Lines";
  public description = "This plugin enables you to draw lines on the map.";

  private viewer!: NonNullable<IITCCore["viewer"]>;
  private logManager!: NonNullable<IITCCore["logManager"]>;
  private interfaceManager!: NonNullable<IITCCore["interfaceManager"]>;
  private layerManager!: NonNullable<IITCCore["layerManager"]>;
  private portalManager!: NonNullable<IITCCore["portalManager"]>;

  private isDrawing: boolean = false;
  private isDeleting: boolean = false;
  private isLineStarted: boolean = false;

  private drawLinesButtonEl: HTMLElement | undefined;
  private deleteLinesButtonEl: HTMLElement | undefined;
  private clearLinesButtonEl: HTMLElement | undefined;
  private exportLinesButtonEl: HTMLElement | undefined;
  private importLinesButtonEl: HTMLElement | undefined;

  private selectedEntityChangedListener: (() => void) | undefined;
  private handler: Cesium.ScreenSpaceEventHandler | undefined;
  private currentLine: Cesium.Cartesian3[] | undefined;
  private previewPrimitive: Cesium.GroundPolylinePrimitive | undefined;
  private previewNeedsRefresh = false;
  private previewTerrainHeightsReady = false;
  private lineMarkerImage: string | undefined;
  private lineStartMarkerBillboard: Cesium.Billboard | undefined;
  private lineEndMarkerBillboard: Cesium.Billboard | undefined;
  private lineMarkerRemovalTimeout: number | undefined;
  private linesLayer: GroundPrimitivesLayer | undefined;
  private lineMarkersLayer: OverlayLayer | undefined;
  private lines: Map<string, DrawLine> = new Map();
  private appearanceOverrides: Map<string, Map<string, DrawLineAppearanceOverride>> = new Map();
  private linePrimitiveKeys: Set<string> = new Set();
  private drawLinesChangedCallbacks: Set<DrawLinesChangedCallback> = new Set();
  private readonly lineStartMarkerPrimitiveId: LineMarkerPrimitiveId = { type: "draw-line-marker", marker: "start" };
  private readonly lineEndMarkerPrimitiveId: LineMarkerPrimitiveId = { type: "draw-line-marker", marker: "end" };
  private readonly previewPreUpdateAction = () => this.refreshPreviewPrimitive();
  private pendingPointerPosition: Cesium.Cartesian2 | undefined;
  private pointerActionFrameId: number | undefined;
  private touchStartPositions = new Map<number, TouchStartPosition>();
  private isTouchGestureInProgress = false;
  private ignoreTouchGestureUntil = 0;

  public init() {
    const iitc: IITCCore = safeWindow.iitc;
    this.viewer = iitc.viewer!;
    this.logManager = iitc.logManager!;
    this.interfaceManager = iitc.interfaceManager!;
    this.layerManager = iitc.layerManager!;
    this.portalManager = iitc.portalManager!;

    if (!this.viewer || !this.logManager || !this.interfaceManager || !this.layerManager || !this.portalManager) {
      console.warn(`[WARN]IITC Next core components missing`, {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        interfaceManager: !!this.interfaceManager,
        layerManager: !!this.layerManager,
        portalManager: !!this.portalManager,
      });
      return;
    }

    try {
      this.drawLinesButtonEl = DrawLinesButton({ onClick: () => this.toggleDrawing() });
      this.deleteLinesButtonEl = DeleteLinesButton({ onClick: () => this.toggleDeleting() });
      this.clearLinesButtonEl = ClearLinesButton({ onClick: () => this.clearLines() });
      this.exportLinesButtonEl = ExportLinesButton({ onClick: () => this.exportLines() });
      this.importLinesButtonEl = ImportLinesButton({ onClick: () => this.importLines() });

      this.interfaceManager.mountSidebarButton(this.drawLinesButtonEl);
      this.interfaceManager.mountSidebarButton(this.deleteLinesButtonEl);
      this.interfaceManager.mountSidebarButton(this.clearLinesButtonEl);
      this.interfaceManager.mountSidebarButton(this.exportLinesButtonEl);
      this.interfaceManager.mountSidebarButton(this.importLinesButtonEl);

      this.linesLayer = this.layerManager.getOrCreateGroundPrimitiveLayer(LINES_LAYER_NAME, DRAW_LINES_PRIMITIVE_Z_INDEX);
      this.lineMarkersLayer = this.layerManager.getOrCreateOverlayLayer(LINE_MARKERS_LAYER_NAME);
      this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      this.bindEvents();
      this.initializePreviewTerrainHeights(this.linesLayer);

      const lines = this.readLinesFromKml(safeLocalStorage.getItem(STORAGE_KEY) || "");
      lines?.forEach(line => this.addDrawLine(line));
      this.rebuildLinePrimitives();
      this.notifyDrawLinesChanged();
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to initialize draw lines plugin", e);
    }
  }

  public deinit() {
    try {
      this.unbindEvents();
      this.handler = undefined;

      this.removePreview();
      this.removeLineMarkers();

      this.layerManager.removeOverlayLayer(LINE_MARKERS_LAYER_NAME);
      this.layerManager.removeGroundPrimitiveLayer(LINES_LAYER_NAME);

      if (this.importLinesButtonEl) this.interfaceManager.unmountSidebarButton(this.importLinesButtonEl);
      if (this.exportLinesButtonEl) this.interfaceManager.unmountSidebarButton(this.exportLinesButtonEl);
      if (this.clearLinesButtonEl) this.interfaceManager.unmountSidebarButton(this.clearLinesButtonEl);
      if (this.deleteLinesButtonEl) this.interfaceManager.unmountSidebarButton(this.deleteLinesButtonEl);
      if (this.drawLinesButtonEl) this.interfaceManager.unmountSidebarButton(this.drawLinesButtonEl);

      this.exportLinesButtonEl = undefined;
      this.deleteLinesButtonEl = undefined;
      this.drawLinesButtonEl = undefined;

      this.currentLine = undefined;
      this.previewTerrainHeightsReady = false;
      this.lineMarkersLayer = undefined;
      this.linesLayer = undefined;
      this.lines.clear();
      this.appearanceOverrides.clear();
      this.linePrimitiveKeys.clear();
      this.notifyDrawLinesChanged();
      this.isDrawing = false;
      this.isDeleting = false;
      this.isLineStarted = false;
    } catch (e) {
      this.logManager.error(LOG_TAG, "Failed to deinitialize draw lines plugin", e);
    }
  }

  public forEachDrawLineData(callback: (data: DrawLineData) => void): void {
    this.lines.forEach(line => callback(line.data));
  }

  public addDrawLinesChangedListener(callback: DrawLinesChangedCallback): void {
    this.drawLinesChangedCallbacks.add(callback);
  }

  public removeDrawLinesChangedListener(callback: DrawLinesChangedCallback): void {
    this.drawLinesChangedCallbacks.delete(callback);
  }

  public setAppearanceOverrides(
    ownerId: string,
    overrides: ReadonlyMap<string, DrawLineAppearanceOverride>,
  ): void {
    const nextOverrides = new Map(
      Array.from(overrides, ([lineId, appearance]) => [lineId, { ...appearance }]),
    );
    const currentOverrides = this.appearanceOverrides.get(ownerId);
    if (appearanceOverrideMapsEqual(currentOverrides, nextOverrides)) return;

    if (nextOverrides.size === 0) this.appearanceOverrides.delete(ownerId);
    else this.appearanceOverrides.set(ownerId, nextOverrides);
    this.rebuildLinePrimitives();
  }

  public clearAppearanceOverrides(ownerId: string): void {
    if (!this.appearanceOverrides.delete(ownerId)) return;

    this.rebuildLinePrimitives();
  }

  private bindEvents() {
    if (!this.viewer) throw new Error("viewer is undefined");
    if (!this.handler) throw new Error("handler is undefined");

    // Avoid selection box when drawing or deleting line
    this.selectedEntityChangedListener = () => {
      if (this.isDrawing || this.isDeleting) {
        this.viewer.selectedEntity = undefined;
      }
    };
    this.viewer.selectedEntityChanged.addEventListener(this.selectedEntityChangedListener);
    this.bindTouchGestureEvents();

    // LEFT_CLICK: start/finish/delete line
    this.handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (this.shouldIgnoreTouchGesture()) return;

      if (this.isDrawing) {
        const pos = this.resolvePosition(event.position);
        if (pos) {
          if (this.isLineStarted) this.finishLine(pos);
          else this.startLine(pos);
        }
        this.restoreSceneAfterPointerPick();
      } else if (this.isDeleting) {
        const line = this.resolveLine(event.position);
        if (line) {
          this.deleteLine(line);
        }
        this.restoreSceneAfterPointerPick();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // MOUSE_MOVE: update preview or update pointer shape
    this.handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      this.queuePointerAction(event.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // RIGHT_CLICK: cancel line
    this.handler.setInputAction(() => {
      this.cancelLine();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  private unbindEvents() {
    this.unbindTouchGestureEvents();
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    this.pendingPointerPosition = undefined;
    if (this.pointerActionFrameId !== undefined) window.cancelAnimationFrame(this.pointerActionFrameId);
    this.pointerActionFrameId = undefined;
    if (this.selectedEntityChangedListener) {
      this.viewer?.selectedEntityChanged.removeEventListener(this.selectedEntityChangedListener);
      this.selectedEntityChangedListener = undefined;
    }
  }

  private queuePointerAction(position: Cesium.Cartesian2): void {
    if (this.shouldIgnoreTouchGesture() || (!this.isLineStarted && !this.isDeleting)) return;

    this.pendingPointerPosition = Cesium.Cartesian2.clone(position);
    if (this.pointerActionFrameId !== undefined) return;

    this.pointerActionFrameId = window.requestAnimationFrame(() => this.flushPointerAction());
  }

  private flushPointerAction(): void {
    this.pointerActionFrameId = undefined;
    const position = this.pendingPointerPosition;
    this.pendingPointerPosition = undefined;
    if (!position) return;

    if (this.isDrawing && this.isLineStarted) {
      const resolvedPosition = this.resolvePosition(position);
      if (resolvedPosition) this.renderPreview(resolvedPosition);
    } else if (this.isDeleting) {
      const line = this.resolveLine(position);
      this.viewer.scene.canvas.style.cursor = line ? "pointer" : "default";
    } else return;

    this.restoreSceneAfterPointerPick();
  }

  private restoreSceneAfterPointerPick(): void {
    restoreSceneAfterPick(this.viewer.scene);
  }

  private bindTouchGestureEvents() {
    const canvas = this.viewer?.scene.canvas;
    if (!canvas) return;

    canvas.addEventListener("touchstart", this.handleTouchStart, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchmove", this.handleTouchMove, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchend", this.handleTouchEnd, TOUCH_EVENT_OPTIONS);
    canvas.addEventListener("touchcancel", this.handleTouchEnd, TOUCH_EVENT_OPTIONS);
  }

  private unbindTouchGestureEvents() {
    const canvas = this.viewer?.scene.canvas;
    if (!canvas) return;

    canvas.removeEventListener("touchstart", this.handleTouchStart, TOUCH_EVENT_OPTIONS);
    canvas.removeEventListener("touchmove", this.handleTouchMove, TOUCH_EVENT_OPTIONS);
    canvas.removeEventListener("touchend", this.handleTouchEnd, TOUCH_EVENT_OPTIONS);
    canvas.removeEventListener("touchcancel", this.handleTouchEnd, TOUCH_EVENT_OPTIONS);
    this.touchStartPositions.clear();
    this.isTouchGestureInProgress = false;
    this.ignoreTouchGestureUntil = 0;
  }

  private handleTouchStart = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      this.touchStartPositions.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
      });
    }

    if (event.touches.length > 1) this.markTouchGesture();
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      this.markTouchGesture();
      return;
    }

    for (const touch of Array.from(event.changedTouches)) {
      const start = this.touchStartPositions.get(touch.identifier);
      if (!start) continue;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > TOUCH_GESTURE_MOVE_THRESHOLD_PX) {
        this.markTouchGesture();
        return;
      }
    }
  };

  private handleTouchEnd = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      this.touchStartPositions.delete(touch.identifier);
    }

    if (event.touches.length === 0) {
      this.touchStartPositions.clear();
      if (this.isTouchGestureInProgress) {
        this.ignoreTouchGestureUntil = Date.now() + TOUCH_GESTURE_IGNORE_MS;
      }
      this.isTouchGestureInProgress = false;
    }
  };

  private markTouchGesture() {
    this.isTouchGestureInProgress = true;
    this.ignoreTouchGestureUntil = Date.now() + TOUCH_GESTURE_IGNORE_MS;
  }

  private shouldIgnoreTouchGesture(): boolean {
    return this.isTouchGestureInProgress || Date.now() < this.ignoreTouchGestureUntil;
  }

  private startLine(pos: Cesium.Cartesian3) {
    this.currentLine = [pos];
    this.isLineStarted = true;
    this.viewer.scene.preUpdate.addEventListener(this.previewPreUpdateAction);
    this.removeLineMarkers();
    this.showLineMarker("start", pos);
    this.renderPreview(pos);
  }

  private finishLine(pos: Cesium.Cartesian3) {
    if (!this.currentLine) throw new Error("currentLine is undefined");

    this.renderPreview(pos);  // Ensure this.currentLine has two vertices
    this.addDrawLine({
      id: `draw-line-${crypto.randomUUID()}`,
      positions: this.currentLine,
    });
    this.rebuildLinePrimitives();
    this.notifyDrawLinesChanged();
    this.saveLines();

    this.removePreview();
    this.showLineMarker("end", pos);
    this.scheduleLineMarkersRemoval();
    this.currentLine = undefined;
    this.isLineStarted = false;
  }

  private cancelLine() {
    this.removePreview();
    this.removeLineMarkers();
    this.currentLine = undefined;
    this.isLineStarted = false;
  }

  private deleteLine(line: DrawLine) {
    this.lines.delete(line.data.id);
    this.appearanceOverrides.forEach((overrides, ownerId) => {
      overrides.delete(line.data.id);
      if (overrides.size === 0) this.appearanceOverrides.delete(ownerId);
    });
    this.rebuildLinePrimitives();
    this.notifyDrawLinesChanged();
    this.saveLines();
  }

  private clearLines(): void {
    if (!this.interfaceManager) throw new Error("interfaceManager is undefined");

    if (this.isDrawing) this.toggleDrawing();
    if (this.isDeleting) this.toggleDeleting();
    
    const container = this.interfaceManager.getContainer();
    const confirmPane = ConfirmPane({
      msg: "Clear all the lines?",
      onConfirm: () => {
        this.lines.clear();
        this.appearanceOverrides.clear();
        this.rebuildLinePrimitives();
        this.notifyDrawLinesChanged();
        this.saveLines();
        container.removeChild(confirmPane);
      },
      onCancel: () => {
        container.removeChild(confirmPane);
      },
    });
    container.appendChild(confirmPane);
  }

  private exportLines(): void {
    if (this.isDrawing) this.toggleDrawing();
    if (this.isDeleting) this.toggleDeleting();

    const kml = this.writeLinesToKml(Array.from(this.lines.values(), line => line.data));

    // Support for Android Wrapper
    // @ts-expect-error support for Android wrapper
    if (window.IITC_Native && window.IITC_Native.saveFile) {
      // @ts-expect-error support for Android wrapper
      window.IITC_Native.saveFile(kml, "draw-lines.kml", "application/vnd.google-earth.kml+xml");
      return;
    }

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "draw-lines.kml";
    a.click();
    URL.revokeObjectURL(url);
  }
  
  private importLines(): void {
    if (!this.interfaceManager) throw new Error("interfaceManager is undefined");

    if (this.isDrawing) this.toggleDrawing();
    if (this.isDeleting) this.toggleDeleting();

    const container = this.interfaceManager.getContainer();

    const confirmPane = ConfirmPane({
      msg: "Import will overwrite existing lines!",
      onConfirm: () => {
        this.performImport();
        container.removeChild(confirmPane);
      },
      onCancel: () => {
        container.removeChild(confirmPane);
      },
    });
    container.appendChild(confirmPane);
  }

  private performImport(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".kml";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const lines = this.readLinesFromKml(content);
          if (lines) {
            this.lines.clear();
            this.appearanceOverrides.clear();
            lines.forEach(line => this.addDrawLine(line));
            this.rebuildLinePrimitives();
            this.saveLines();
            this.notifyDrawLinesChanged();
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private renderPreview(pos: Cesium.Cartesian3) {
    if (!this.currentLine) throw new Error("currentLine is undefined");

    if (this.currentLine.length === 2) this.currentLine.pop();
    this.currentLine.push(pos);
    this.previewNeedsRefresh = true;
    this.viewer.scene.requestRender();
  }

  private removePreview() {
    this.viewer.scene.preUpdate.removeEventListener(this.previewPreUpdateAction);
    this.previewNeedsRefresh = false;
    if (this.previewPrimitive && this.linesLayer) {
      this.linesLayer.removePrimitive(this.previewPrimitive);
    }
    this.previewPrimitive = undefined;
  }

  private refreshPreviewPrimitive(): void {
    if (!this.previewNeedsRefresh || !this.previewTerrainHeightsReady) return;

    // Match Cesium's dynamic updater by rebuilding clamped geometry before this frame renders.
    const linesLayer = this.linesLayer;
    const currentLine = this.currentLine;
    if (!linesLayer || !currentLine || currentLine.length < 2) return;

    this.previewNeedsRefresh = false;
    if (this.previewPrimitive) linesLayer.removePrimitive(this.previewPrimitive);
    this.previewPrimitive = undefined;

    if (Cesium.Cartesian3.equals(currentLine[0], currentLine[1])) return;

    this.previewPrimitive = linesLayer.addPrimitive(createLinePrimitive(
      [createLineGeometryInstance(currentLine, LINE_WIDTH)],
      createPolylineAppearance({
        color: PREVIEW_COLOR,
        alpha: LINE_ALPHA,
        width: LINE_WIDTH,
      }),
      false,
      false,
    ));
  }

  private initializePreviewTerrainHeights(linesLayer: GroundPrimitivesLayer): void {
    this.previewTerrainHeightsReady = false;
    void Cesium.GroundPolylinePrimitive.initializeTerrainHeights().then(() => {
      if (this.linesLayer !== linesLayer) return;

      this.previewTerrainHeightsReady = true;
      if (this.previewNeedsRefresh) this.viewer.scene.requestRender();
    });
  }

  private showLineMarker(marker: "start" | "end", pos: Cesium.Cartesian3) {
    if (!this.viewer) throw new Error("viewer is undefined");
    if (!this.lineMarkersLayer) throw new Error("lineMarkersLayer is undefined");

    if (!this.lineMarkerImage) this.lineMarkerImage = this.createLineMarkerImage();

    const existingMarker = marker === "start" ? this.lineStartMarkerBillboard : this.lineEndMarkerBillboard;
    if (existingMarker) {
      existingMarker.position = pos;
      this.viewer.scene.requestRender();
    } else {
      const billboard = this.lineMarkersLayer.addBillboard({
        id: marker === "start" ? this.lineStartMarkerPrimitiveId : this.lineEndMarkerPrimitiveId,
        position: pos,
        image: this.lineMarkerImage,
        width: LINE_MARKER_SIZE_PX,
        height: LINE_MARKER_SIZE_PX,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: 2e4,
      });

      if (marker === "start") {
        this.lineStartMarkerBillboard = billboard;
      } else {
        this.lineEndMarkerBillboard = billboard;
      }
    }
  }

  private removeLineMarkers() {
    if (!this.lineMarkersLayer) throw new Error("lineMarkersLayer is undefined");

    this.cancelLineMarkersRemoval();
    if (this.lineStartMarkerBillboard) this.lineMarkersLayer.removeBillboard(this.lineStartMarkerBillboard);
    if (this.lineEndMarkerBillboard) this.lineMarkersLayer.removeBillboard(this.lineEndMarkerBillboard);
    this.lineStartMarkerBillboard = undefined;
    this.lineEndMarkerBillboard = undefined;
  }

  private scheduleLineMarkersRemoval() {
    this.cancelLineMarkersRemoval();
    this.lineMarkerRemovalTimeout = window.setTimeout(() => {
      this.lineMarkerRemovalTimeout = undefined;
      this.removeLineMarkers();
    }, LINE_MARKER_TIMEOUT_MS);
  }

  private cancelLineMarkersRemoval() {
    if (this.lineMarkerRemovalTimeout === undefined) return;

    window.clearTimeout(this.lineMarkerRemovalTimeout);
    this.lineMarkerRemovalTimeout = undefined;
  }

  private createLineMarkerImage(): string {
    const canvas = document.createElement("canvas");
    canvas.width = LINE_MARKER_SIZE_PX;
    canvas.height = LINE_MARKER_SIZE_PX;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("marker canvas context is undefined");

    ctx.fillStyle = LINE_MARKER_FILL_COLOR;
    ctx.fillRect(0, 0, LINE_MARKER_SIZE_PX, LINE_MARKER_SIZE_PX);
    ctx.strokeStyle = LINE_MARKER_BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, LINE_MARKER_SIZE_PX - 1, LINE_MARKER_SIZE_PX - 1);

    return canvas.toDataURL();
  }

  private toggleDrawing() {
    this.isDrawing = !this.isDrawing;
    this.cancelLine();
    if (this.isDeleting) {
      this.isDeleting = false;
    }
    if (this.drawLinesButtonEl) {
      this.drawLinesButtonEl.style.background = this.isDrawing ? "#4389bb" : "#303336";
      this.drawLinesButtonEl.style.borderColor = this.isDrawing ? "#21ee21" : "#444444";
      this.drawLinesButtonEl.style.boxShadow = this.isDrawing ? "rgb(255, 255, 255) 0px 0px 8px 0px, rgb(255, 255, 255) 0px 0px 8px 0px" : "none";
    }
    if (this.deleteLinesButtonEl) {
      this.deleteLinesButtonEl.style.background = "#303336";
      this.deleteLinesButtonEl.style.borderColor = "#444444";
      this.deleteLinesButtonEl.style.boxShadow = "none";
    }

    // Ensure the pointer is back to default on touch devices
    this.viewer.scene.canvas.style.cursor = "default";
  }

  private toggleDeleting() {
    this.isDeleting = !this.isDeleting;
    if (this.isDrawing) {
      this.isDrawing = false;
      this.cancelLine();
    }
    if (this.deleteLinesButtonEl) {
      this.deleteLinesButtonEl.style.background = this.isDeleting ? "#4389bb" : "#303336";
      this.deleteLinesButtonEl.style.borderColor = this.isDeleting ? "#21ee21" : "#444444";
      this.deleteLinesButtonEl.style.boxShadow = this.isDeleting ? "rgb(255, 255, 255) 0px 0px 8px 0px, rgb(255, 255, 255) 0px 0px 8px 0px" : "none";
    }
    if (this.drawLinesButtonEl) {
      this.drawLinesButtonEl.style.background = "#303336";
      this.drawLinesButtonEl.style.borderColor = "#444444";
      this.drawLinesButtonEl.style.boxShadow = "none";
    }

    // Ensure the pointer is back to default on touch devices
    this.viewer.scene.canvas.style.cursor = "default";
  }

  private resolveLine(position: Cesium.Cartesian2): DrawLine | undefined {
    if (!this.viewer) throw new Error("viewer is undefined");

    const picked = this.viewer.scene.pick(position);
    const pickedId = picked?.id;
    if (!this.isDrawLinePrimitiveId(pickedId)) return;

    const line = this.lines.get(pickedId.lineId);
    if (line?.primitiveId === pickedId) return line;
  }

  private resolvePosition(position: Cesium.Cartesian2, snap: boolean = true): Cesium.Cartesian3 | undefined {
    if (!this.viewer) throw new Error("viewer is undefined");

    const picked = this.viewer.scene.pick(position);
    const pickedId = picked?.id;
    if (snap && isPortalPrimitiveId(pickedId)) {
      return this.portalManager.getPortalPosition(pickedId.guid);
    }
    if (snap && this.isLineMarkerPrimitiveId(pickedId)) {
      return this.getLineMarkerPosition(pickedId);
    }

    const surfacePosition = pickSceneSurfacePosition(this.viewer.scene, position);
    return surfacePosition ? Cesium.Cartesian3.clone(surfacePosition) : undefined;
  }

  private isLineMarkerPrimitiveId(value: unknown): value is LineMarkerPrimitiveId {
    return value === this.lineStartMarkerPrimitiveId || value === this.lineEndMarkerPrimitiveId;
  }

  private isDrawLinePrimitiveId(value: unknown): value is DrawLinePrimitiveId {
    if (typeof value !== "object" || value === null) return false;

    const id = value as Partial<DrawLinePrimitiveId>;
    return id.type === "draw-line" && typeof id.lineId === "string";
  }

  private getLineMarkerPosition(id: LineMarkerPrimitiveId): Cesium.Cartesian3 | undefined {
    return id.marker === "start" ?
      this.lineStartMarkerBillboard?.position :
      this.lineEndMarkerBillboard?.position;
  }

  private writeLinesToKml(lines: DrawLineData[]): string {
    const placemarks = lines.map((line) => {
      const cartographic: Cesium.Cartographic[] = line.positions.map(pos => Cesium.Cartographic.fromCartesian(pos));
      const coordinatesString = cartographic.map(c =>
        `          ${Cesium.Math.toDegrees(c.longitude)},${Cesium.Math.toDegrees(c.latitude)},${c.height}\n`,
      ).join("");

      return `` +
        `    <Placemark>\n` +
        `      <name>${line.name || "LineString"}</name>\n` +
        `      <LineString>\n` +
        `        <tessellate>1</tessellate>\n` +
        `        <coordinates>\n` +
        `${coordinatesString}` +
        `        </coordinates>\n` +
        `      </LineString>\n` +
        `    </Placemark>\n`;
    }).join("");

    return `` +
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<kml xmlns="https://www.opengis.net/kml/2.2">\n` +
      `  <Document>\n` +
      `    <name>IITC Next Lines</name>\n` +
      `${placemarks}` +
      `  </Document>\n` +
      `</kml>\n`;
  }

  private readLinesFromKml(kml: string): DrawLineData[] | undefined {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kml, "text/xml");
      const placemarks = xmlDoc.getElementsByTagName("Placemark");
      const lines: DrawLineData[] = [];

      for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        const lineString = placemark.getElementsByTagName("LineString")[0];
        if (lineString) {
          const coordinatesElement = lineString.getElementsByTagName("coordinates")[0];
          if (coordinatesElement && coordinatesElement.textContent) {
            const coordsText = coordinatesElement.textContent.trim();
            const coordLines = coordsText.split(/\s+/);
            const positions: Cesium.Cartesian3[] = [];

            coordLines.forEach(line => {
              const parts = line.split(",");
              if (parts.length >= 2) {
                const lon = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                const alt = parts.length > 2 ? parseFloat(parts[2]) : 0;
                positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
              }
            });

            if (positions.length >= 2) {
              const nameElement = placemark.getElementsByTagName("name")[0];
              const name = nameElement ? nameElement.textContent || undefined : undefined;

              lines.push({
                id: `draw-line-${crypto.randomUUID()}`,
                name,
                positions,
              });
            }
          }
        }
      }

      return lines;
    } catch (error) {
      this.logManager.warn(LOG_TAG, "Failed to parse lines from storage", error);
      safeLocalStorage.setItem(STORAGE_KEY, "");
    }
  }

  private addDrawLine(data: DrawLineData): void {
    this.lines.set(data.id, {
      data,
      primitiveId: {
        type: "draw-line",
        lineId: data.id,
      },
    });
  }

  private rebuildLinePrimitives(): void {
    const linesLayer = this.linesLayer;
    if (!linesLayer) return;

    const groups = new Map<string, DrawLinePrimitiveGroup>();
    this.lines.forEach(line => {
      const appearance = this.getLineAppearance(line.data.id);
      const appearanceKey = getLineAppearanceKey(appearance);
      let group = groups.get(appearanceKey);
      if (!group) {
        group = { appearance, geometryInstances: [] };
        groups.set(appearanceKey, group);
      }

      group.geometryInstances.push(createLineGeometryInstance(
        line.data.positions,
        appearance.width,
        line.primitiveId,
      ));
    });

    const nextPrimitiveKeys = new Set<string>();
    groups.forEach((group, appearanceKey) => {
      const primitiveKey = `${LINES_PRIMITIVE_KEY}:${appearanceKey}`;
      nextPrimitiveKeys.add(primitiveKey);
      linesLayer.replacePrimitiveWhenReady(primitiveKey, createLinePrimitive(
        group.geometryInstances,
        createPolylineAppearance(group.appearance),
        true,
      ));
    });

    this.linePrimitiveKeys.forEach(key => {
      if (!nextPrimitiveKeys.has(key)) linesLayer.removeManagedPrimitive(key);
    });
    this.linePrimitiveKeys = nextPrimitiveKeys;
  }

  private getLineAppearance(lineId: string): DrawLineAppearance {
    const appearance = { ...DEFAULT_LINE_APPEARANCE };
    this.appearanceOverrides.forEach(overrides => {
      const override = overrides.get(lineId);
      if (!override) return;

      if (override.color !== undefined) appearance.color = override.color;
      if (override.alpha !== undefined) appearance.alpha = override.alpha;
      if (override.width !== undefined) appearance.width = override.width;
      if (override.dashLength !== undefined) appearance.dashLength = override.dashLength ?? undefined;
    });
    return appearance;
  }

  private saveLines(): void {
    const kml = this.writeLinesToKml(Array.from(this.lines.values(), line => line.data));
    safeLocalStorage.setItem(STORAGE_KEY, kml);
  }

  private notifyDrawLinesChanged(): void {
    this.drawLinesChangedCallbacks.forEach(callback => callback());
  }
}

function createLineGeometryInstance(
  positions: Cesium.Cartesian3[],
  width: number,
  id?: DrawLinePrimitiveId,
): Cesium.GeometryInstance {
  return new Cesium.GeometryInstance({
    id,
    geometry: new Cesium.GroundPolylineGeometry({
      positions,
      width,
      arcType: Cesium.ArcType.GEODESIC,
    }),
  });
}

function createLinePrimitive(
  geometryInstances: Cesium.GeometryInstance[],
  appearance: Cesium.PolylineMaterialAppearance,
  allowPicking: boolean,
  asynchronous: boolean = true,
): Cesium.GroundPolylinePrimitive {
  return new Cesium.GroundPolylinePrimitive({
    geometryInstances,
    appearance,
    allowPicking,
    asynchronous,
    classificationType: Cesium.ClassificationType.BOTH,
  });
}

function createPolylineAppearance(appearance: DrawLineAppearance): Cesium.PolylineMaterialAppearance {
  const materialType = appearance.dashLength === undefined
    ? Cesium.Material.ColorType
    : Cesium.Material.PolylineDashType;
  const uniforms: Record<string, unknown> = {
    color: Cesium.Color.fromCssColorString(appearance.color).withAlpha(appearance.alpha),
  };
  if (appearance.dashLength !== undefined) uniforms.dashLength = appearance.dashLength;

  return new Cesium.PolylineMaterialAppearance({
    material: Cesium.Material.fromType(materialType, uniforms),
    translucent: appearance.alpha < 1,
  });
}

function getLineAppearanceKey(appearance: DrawLineAppearance): string {
  return JSON.stringify([
    appearance.color,
    appearance.alpha,
    appearance.width,
    appearance.dashLength ?? null,
  ]);
}

function appearanceOverrideMapsEqual(
  a: ReadonlyMap<string, DrawLineAppearanceOverride> | undefined,
  b: ReadonlyMap<string, DrawLineAppearanceOverride>,
): boolean {
  if (!a) return b.size === 0;
  if (a.size !== b.size) return false;

  for (const [lineId, appearance] of a) {
    const other = b.get(lineId);
    if (!other || !appearanceOverridesEqual(appearance, other)) return false;
  }
  return true;
}

function appearanceOverridesEqual(
  a: DrawLineAppearanceOverride,
  b: DrawLineAppearanceOverride,
): boolean {
  return a.color === b.color &&
    a.alpha === b.alpha &&
    a.width === b.width &&
    a.dashLength === b.dashLength;
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new DrawLinesPlugin());
  } else {
    window.setTimeout(register, 1000);
  }
};

register();
