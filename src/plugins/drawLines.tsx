/**
 * Draw line plugin for IITC Next
 *
 * This plugin enables you to draw lines on the map.
 */

import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";
import { h } from "../utils/dom.ts";
import * as Cesium from "cesium";
import { safeLocalStorage } from "../utils/storage.ts";

const LAYER_NAME = "Draw Lines";
const STORAGE_KEY = "iitc-next-draw-lines";
const PREVIEW_COLOR = "#cc823f";
const LINE_COLOR = "#fa8525";

class DrawLines {
  public id = "draw-lines";
  public name = "Draw Lines";
  public description = "This plugin enables you to draw lines on the map.";

  private viewer: IITCCore["viewer"];
  private logManager: IITCCore["logManager"];
  private interfaceManager: IITCCore["interfaceManager"];
  private layerManager: IITCCore["layerManager"];

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
  private currentLineEntity: Cesium.Entity | undefined;
  private dataSource: Cesium.DataSource | undefined;

  public init() {
    if (safeWindow) {
      const iitc: IITCCore = safeWindow.iitc;
      this.viewer = iitc.viewer!;
      this.logManager = iitc.logManager!;
      this.interfaceManager = iitc.interfaceManager!;
      this.layerManager = iitc.layerManager!;
    }

    if (!this.viewer || !this.logManager || !this.interfaceManager || !this.layerManager) {
      console.warn("[WARN][SamplePlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        interfaceManager: !!this.interfaceManager,
        layerManager: !!this.layerManager,
      });
      return;
    }

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

    this.dataSource = this.layerManager.getOrCreateSourceAndFilter(LAYER_NAME);
    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer?.scene.canvas);
    this.bindEvents();

    // Restore from storage
    const entities = this.readLinesFromKml(safeLocalStorage.getItem(STORAGE_KEY) || "");
    if (entities) entities.forEach(line => this.dataSource?.entities.add(line));
  }

  public deinit() {
    if (!this.handler) throw new Error("draw-lines: handler is undefined");
    if (!this.layerManager) throw new Error("draw-lines: layer manager is undefined");
    if (!this.interfaceManager) throw new Error("draw-lines: interface manager is undefined");
    if (!this.importLinesButtonEl) throw new Error("draw-lines: importLinesButtonEl is undefined");
    if (!this.exportLinesButtonEl) throw new Error("draw-lines: exportLinesButtonEl is undefined");
    if (!this.clearLinesButtonEl) throw new Error("draw-lines: clearLinesButtonEl is undefined");
    if (!this.deleteLinesButtonEl) throw new Error("draw-lines: deleteLinesButtonEl is undefined");
    if (!this.drawLinesButtonEl) throw new Error("draw-lines: drawLinesButtonEl is undefined");

    this.unbindEvents();
    this.handler = undefined;
    this.layerManager.removeSourceAndFilter(LAYER_NAME);

    this.interfaceManager.unmountSidebarButton(this.importLinesButtonEl);
    this.interfaceManager.unmountSidebarButton(this.exportLinesButtonEl);
    this.interfaceManager.unmountSidebarButton(this.clearLinesButtonEl);
    this.interfaceManager.unmountSidebarButton(this.deleteLinesButtonEl);
    this.interfaceManager.unmountSidebarButton(this.drawLinesButtonEl);

    this.exportLinesButtonEl = undefined;
    this.deleteLinesButtonEl = undefined;
    this.drawLinesButtonEl = undefined;

    this.currentLine = undefined;
    this.currentLineEntity = undefined;
    this.dataSource = undefined;
    this.isDrawing = false;
    this.isDeleting = false;
    this.isLineStarted = false;
  }

  private bindEvents() {
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");
    if (!this.handler) throw new Error("draw-lines: handler is undefined");

    // Avoid selection box when drawing or deleting line
    this.selectedEntityChangedListener = () => {
      if ((this.isDrawing || this.isDeleting) && this.viewer) {
        this.viewer.selectedEntity = undefined;
      }
    };
    this.viewer.selectedEntityChanged.addEventListener(this.selectedEntityChangedListener);

    // LEFT_CLICK: start/finish/delete line
    this.handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (this.isDrawing) {
        const pos = this.resolvePosition(event.position);
        if (pos) {
          if (this.isLineStarted) this.finishLine(pos);
          else this.startLine(pos);
        }
      }
      if (this.isDeleting) {
        const entity = this.resolveLine(event.position);
        if (entity) {
          this.deleteLine(entity);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // MOUSE_MOVE: update preview or update pointer shape
    this.handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (this.isDrawing) {
        const pos = this.resolvePosition(event.endPosition);
        if (pos) {
          if (this.isLineStarted) this.renderPreview(pos);
        }
      }
      if (this.isDeleting) {
        const entity = this.resolveLine(event.endPosition);
        if (entity) {
          if (this.viewer) this.viewer.scene.canvas.style.cursor = "pointer";
        } else {
          if (this.viewer) this.viewer.scene.canvas.style.cursor = "default";
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // RIGHT_CLICK: cancel line
    this.handler.setInputAction(() => {
      if (!this.isDrawing) return;
      if (this.isLineStarted) this.cancelLine();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  private unbindEvents() {
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this.handler?.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    if (this.selectedEntityChangedListener) {
      this.viewer?.selectedEntityChanged.removeEventListener(this.selectedEntityChangedListener);
      this.selectedEntityChangedListener = undefined;
    }
  }

  private startLine(pos: Cesium.Cartesian3) {
    this.currentLine = [pos];
    this.isLineStarted = true;
    this.renderPreview(pos);
  }

  private finishLine(pos: Cesium.Cartesian3) {
    if (!this.dataSource) throw new Error("draw-lines: source is undefined");
    if (!this.currentLine) throw new Error("draw-lines: current line is undefined");

    this.renderPreview(pos);  // Ensure this.currentLine has two vertices
    this.dataSource.entities.add({
      polyline: {
        positions: this.currentLine,
        material: Cesium.Color.fromCssColorString(LINE_COLOR).withAlpha(0.7),
        width: 3,
      }
    });

    // Save to storage
    const entities = Array.from(this.dataSource.entities.values);
    const kml = this.writeLinesToKml(entities);
    safeLocalStorage.setItem(STORAGE_KEY, kml);

    this.removePreview();
    this.currentLine = undefined;
    this.isLineStarted = false;
  }

  private cancelLine() {
    this.removePreview();
    this.currentLine = undefined;
    this.isLineStarted = false;
  }

  private deleteLine(entity: Cesium.Entity) {
    if (!this.dataSource) throw new Error("draw-lines: source is undefined");
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");

    this.dataSource.entities.remove(entity);
    this.viewer.scene.requestRender();

    // Save to storage
    const entities = Array.from(this.dataSource.entities.values);
    const kml = this.writeLinesToKml(entities);
    safeLocalStorage.setItem(STORAGE_KEY, kml);
  }

  private clearLines(): void {
    if (!this.interfaceManager) throw new Error("InterfaceManager is missing");
    if (!this.dataSource) throw new Error("draw-lines: source is undefined");
    if (!this.viewer) throw new Error("Viewer is missing");

    if (this.isDrawing) this.toggleDrawing();
    if (this.isDeleting) this.toggleDeleting();
    
    const dataSource = this.dataSource;
    const container = this.interfaceManager.getContainer();
    const viewer = this.viewer;

    const confirmPane = ConfirmPane({
      msg: "Clear all the lines?",
      onConfirm: () => {
        dataSource.entities.removeAll();
        container.removeChild(confirmPane);
        viewer.scene.requestRender();

        // Save to storage
        const entities = Array.from(dataSource.entities.values);
        const kml = this.writeLinesToKml(entities);
        safeLocalStorage.setItem(STORAGE_KEY, kml);
      },
      onCancel: () => {
        container.removeChild(confirmPane);
      },
    });
    container.appendChild(confirmPane);
  }

  private exportLines(): void {
    if (!this.dataSource) throw new Error("Data source is missing");
    
    if (this.isDrawing) this.toggleDrawing();
    if (this.isDeleting) this.toggleDeleting();
    
    const entities = Array.from(this.dataSource.entities.values);
    const kml = this.writeLinesToKml(entities);
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "draw-lines.kml";
    a.click();
    URL.revokeObjectURL(url);
  }
  
  private importLines(): void {
    if (!this.interfaceManager) throw new Error("InterfaceManager is missing");

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
        if (!this.interfaceManager) return;
        container.removeChild(confirmPane);
      },
    });
    container.appendChild(confirmPane);
  }

  private performImport(): void {
    if (!this.interfaceManager) throw new Error("InterfaceManager is missing");
    if (!this.dataSource) throw new Error("draw-lines: source is undefined");
    if (!this.viewer) throw new Error("Viewer is missing");

    const dataSource = this.dataSource;
    const viewer = this.viewer;

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
          const entities = this.readLinesFromKml(content);
          if (entities) {
            dataSource.entities.removeAll();
            entities.forEach(line => dataSource.entities.add(line));

            // Save to storage
            const updatedEntities = Array.from(dataSource.entities.values);
            const kml = this.writeLinesToKml(updatedEntities);
            safeLocalStorage.setItem(STORAGE_KEY, kml);

            viewer.scene.requestRender();
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private renderPreview(pos: Cesium.Cartesian3) {
    if (!this.dataSource) throw new Error("draw-lines: data source is undefined");
    if (!this.currentLine) throw new Error("draw-lines: current line is undefined");
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");

    if (this.currentLine.length === 2) this.currentLine.pop();
    this.currentLine.push(pos);

    if (!this.currentLineEntity) {
      this.currentLineEntity = this.dataSource.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => this.currentLine, false),
          material: Cesium.Color.fromCssColorString(PREVIEW_COLOR).withAlpha(0.7),
          width: 3,
        }
      });
    }

    this.viewer.scene.requestRender();
  }

  private removePreview() {
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");
    if (!this.dataSource) throw new Error("draw-lines: data source is undefined");
    if (!this.currentLineEntity) throw new Error("draw-lines: current line entity is undefined");

    this.dataSource.entities.remove(this.currentLineEntity);
    this.currentLineEntity = undefined;

    this.viewer.scene.requestRender();
  }

  private toggleDrawing() {
    this.isDrawing = !this.isDrawing;
    this.isDeleting = false;
    if (this.currentLine) this.cancelLine();
    if (this.drawLinesButtonEl) this.drawLinesButtonEl.style.borderColor = this.isDrawing ? "#21ee21" : "#444444";
    if (this.drawLinesButtonEl) this.drawLinesButtonEl.style.boxShadow = this.isDrawing ? "rgb(255, 255, 255) 0px 0px 8px 0px, rgb(255, 255, 255) 0px 0px 8px 0px" : "none";
    if (this.deleteLinesButtonEl) this.deleteLinesButtonEl.style.borderColor = "#444444";
    if (this.deleteLinesButtonEl) this.deleteLinesButtonEl.style.boxShadow = "none";

    // Ensure the pointer is back to default on touch devices
    if (this.viewer) this.viewer.scene.canvas.style.cursor = "default";
  }

  private toggleDeleting() {
    this.isDeleting = !this.isDeleting;
    this.isDrawing = false;
    if (this.deleteLinesButtonEl) this.deleteLinesButtonEl.style.borderColor = this.isDeleting ? "#21ee21" : "#444444";
    if (this.deleteLinesButtonEl) this.deleteLinesButtonEl.style.boxShadow = this.isDeleting ? "rgb(255, 255, 255) 0px 0px 8px 0px, rgb(255, 255, 255) 0px 0px 8px 0px" : "none";
    if (this.drawLinesButtonEl) this.drawLinesButtonEl.style.borderColor = "#444444";
    if (this.drawLinesButtonEl) this.drawLinesButtonEl.style.boxShadow = "none";

    // Ensure the pointer is back to default on touch devices
    if (this.viewer) this.viewer.scene.canvas.style.cursor = "default";
  }

  private resolveLine(position: Cesium.Cartesian2): Cesium.Entity | undefined {
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");
    if (!this.dataSource) throw new Error("draw-lines: data source is undefined");

    const picked = this.viewer.scene.pick(position);
    if (picked && picked.id instanceof Cesium.Entity) {
      return this.dataSource.entities.getById(picked.id.id);
    }
  }

  private resolvePosition(position: Cesium.Cartesian2, snap: boolean = true): Cesium.Cartesian3 | undefined {
    if (!this.viewer) throw new Error("draw-lines: viewer is undefined");

    const picked = this.viewer.scene.pick(position);
    if (snap && picked && picked.id instanceof Cesium.Entity && picked.id.id.startsWith("portal")) {
      return picked.id.position.getValue();
    } else {
      return this.viewer.camera.pickEllipsoid(position, this.viewer.scene.globe.ellipsoid);
    }
  }

  private writeLinesToKml(entities: Cesium.Entity[]): string {
    const placemarks = entities.map((entity) => {
      const positions: Cesium.Cartesian3[] = entity.polyline?.positions?.getValue(Cesium.JulianDate.now());
      const cartographic: Cesium.Cartographic[] = positions.map(pos => Cesium.Cartographic.fromCartesian(pos));
      const coordinatesString = cartographic.map(c =>
        `          ${Cesium.Math.toDegrees(c.longitude)},${Cesium.Math.toDegrees(c.latitude)},${c.height}\n`
      ).join("");

      return `` +
        `    <Placemark>\n` +
        `      <name>${entity.name || "LineString"}</name>\n` +
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

  private readLinesFromKml(kml: string): Cesium.Entity[] | undefined {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kml, "text/xml");
      const placemarks = xmlDoc.getElementsByTagName("Placemark");
      const entities: Cesium.Entity[] = [];

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

            if (positions.length > 0) {
              const nameElement = placemark.getElementsByTagName("name")[0];
              const name = nameElement ? nameElement.textContent || undefined : undefined;

              entities.push(new Cesium.Entity({
                name,
                polyline: {
                  positions: positions,
                  material: Cesium.Color.fromCssColorString(LINE_COLOR).withAlpha(0.7),
                  width: 3,
                }
              }));
            }
          }
        }
      }

      return entities;
    } catch (error) {
      this.logManager?.warn("Draw Lines", "Failed to parse lines from storage", error);
      safeLocalStorage.setItem(STORAGE_KEY, "");
    }
  }
}

const DrawLinesButton = ({ onClick }: {
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      title="Draw Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M760-80q-50 0-85-35t-35-85q0-14 3-27t9-25L252-652q-12 6-25 9t-27 3q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 14-3 27t-9 25l400 400q12-6 25-9t27-3q50 0 85 35t35 85q0 50-35 85t-85 35Z" />
      </svg>
    </button>
  ) as HTMLElement;
};

const DeleteLinesButton = ({ onClick }: {
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      title="Delete Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z" />
      </svg>
    </button>
  ) as HTMLElement;
};

const ClearLinesButton = ({ onClick }: {
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      title="Clear Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
      </svg>
    </button>
  ) as HTMLElement;
};

const ExportLinesButton = ({ onClick }: {
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      title="Export Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="m720-120 160-160-56-56-64 64v-167h-80v167l-64-64-56 56 160 160ZM560 0v-80h320V0H560ZM240-160q-33 0-56.5-23.5T160-240v-560q0-33 23.5-56.5T240-880h280l240 240v121h-80v-81H480v-200H240v560h240v80H240Zm0-80v-560 560Z" />
      </svg>
    </button>
  ) as HTMLElement;
};

const ImportLinesButton = ({ onClick }: {
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      title="Import Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M440-200h80v-167l64 64 56-57-160-160-160 160 57 56 63-63v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z" />
      </svg>
    </button>
  ) as HTMLElement;
};

const ConfirmPane = ({ msg, onConfirm, onCancel }: {
  msg: string,
  onConfirm: () => void,
  onCancel: () => void,
}): HTMLElement => {
  return (
    <div style={{
      position: "absolute",
      top: "0px",
      left: "0px",
      bottom: "0px",
      right: "0px",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10040",
    }}>
      <div style={{
        position: "relative",
        width: "250px",
        height: "100px",
        padding: "12px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 32px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: "100%",
          flexGrow: 1
        }}>
          {msg}
        </div>
        <div style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
        }}>
          <button
            style={{
              backgroundColor: "#5091ff",
              border: "1px solid #555",
              color: "white",
              height: "34px",
              padding: "4px 8px",
              borderRadius: "2px",
              fontFamily: "coda_regular, arial, helvetica, sans-serif",
              cursor: "pointer",
            }}
            onClick={() => onConfirm()}
          >
            Confirm
          </button>
          <button
            style={{
              backgroundColor: "#5091ff",
              border: "1px solid #555",
              color: "white",
              height: "34px",
              padding: "4px 8px",
              borderRadius: "2px",
              fontFamily: "coda_regular, arial, helvetica, sans-serif",
              cursor: "pointer",
            }}
            onClick={() => onCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) as HTMLElement;
};

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new DrawLines());
  } else {
    setTimeout(register, 3000);
  }
};

register();
