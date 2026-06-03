/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { PortalData, LinkData, FieldData, TEAMS, PORTAL_LEVELS } from "../types/ingress";
import { PortalEntityManager } from "./portalEntityManager";
import { LinkEntityManager } from "./linkEntityManager";
import { FieldEntityManager } from "./fieldEntityManager";
import { PortalHistoryEntityManager } from "./portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "./scoutHistoryEntityManager";

export class LayerManager {
  private viewer: Cesium.Viewer;

  public readonly portalManager: PortalEntityManager;
  public readonly linkManager: LinkEntityManager;
  public readonly fieldManager: FieldEntityManager;
  public readonly historyManager: PortalHistoryEntityManager;
  public readonly scoutControlHistoryManager: ScoutHistoryEntityManager;

  // Maps sourceVisibility keys to Cesium Sources (layers)
  private sources: Map<string, Cesium.CustomDataSource> = new Map();

  // Granular controls (portals-l8-enlightened, portals-placeholder-resistance, etc.)
  private sourceVisibility: Map<string, boolean> = new Map();

  // Upper level controls (portals, links, fields)
  private filterState: Map<string, boolean> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.portalManager = new PortalEntityManager(this);
    this.linkManager = new LinkEntityManager(this, this.portalManager);
    this.fieldManager = new FieldEntityManager(this, this.portalManager);
    this.historyManager = new PortalHistoryEntityManager(this);
    this.scoutControlHistoryManager = new ScoutHistoryEntityManager(this);

    TEAMS.forEach(t => this.filterState.set(`team-${t.toLowerCase()}`, true));
    PORTAL_LEVELS.forEach(l => this.filterState.set(`portals-level-${l}`, true));
    this.filterState.set("portals-placeholder", true);
    this.filterState.set("portals", true);
    this.filterState.set("links", true);
    this.filterState.set("fields", true);
    this.filterState.set("history", false);
    this.filterState.set("scout-control", false);
    this.filterState.set("history-reverse", false);
    this.filterState.set("scout-control-reverse", false);
    this.filterState.set("debug-tiles", true);
    this.applyFilters();
  }

  public requestRender(): void {
    this.viewer.scene.requestRender();
  }

  public addOrUpdatePortal(data: PortalData): void {
    this.portalManager.addOrUpdatePortal(data);
    this.historyManager.addOrUpdateHistoryHalo(data);
    this.scoutControlHistoryManager.addOrUpdateScoutControlHalo(data);
  }

  public addOrUpdateLink(data: LinkData): void {
    this.linkManager.addOrUpdateLink(data);
  }

  public addOrUpdateField(data: FieldData): void {
    this.fieldManager.addOrUpdateField(data);
  }

  public removePortal(guid: string): void {
    this.portalManager.removePortal(guid);
    this.historyManager.removeHistoryHalo(guid);
    this.scoutControlHistoryManager.removeScoutControlHalo(guid);
  }

  public removeLink(guid: string): void {
    this.linkManager.removeLink(guid);
  }

  public removeField(guid: string): void {
    this.fieldManager.removeField(guid);
  }

  public removeGameEntitiesInView(): void {
    const viewRect = this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    if (!viewRect) return;

    this.portalManager.removePortalInView(viewRect);
    this.historyManager.removeHistoryHaloInView(viewRect);
    this.scoutControlHistoryManager.removeScoutControlHaloInView(viewRect);
    this.linkManager.removeLinkInView(viewRect);
    this.fieldManager.removeFieldInView(viewRect);
  }

  public async requestPortalDetails(guid: string): Promise<void> {
    await this.portalManager.requestPortalDetails(guid);
    const portalData = this.portalManager.getPortalData(guid);
    if (portalData) {
      this.historyManager.addOrUpdateHistoryHalo(portalData);
      this.scoutControlHistoryManager.addOrUpdateScoutControlHalo(portalData);
    }
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portalManager.getPortalData(guid);
  }

  public setFilter(type: string, enabled: boolean): void {
    if (type === "portals") {
      PORTAL_LEVELS.forEach(l => this.filterState.set(`portals-level-${l}`, enabled));
      this.filterState.set("portals-placeholder", enabled);
    }
    this.filterState.set(type, enabled);
    this.applyFilters();
  }

  public isFilterEnabled(type: string): boolean {
    if (type === "portals") {
      const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`portals-level-${l}`) !== false);
      const placeholder = this.filterState.get("portals-placeholder") !== false;
      return allLevels && placeholder;
    }
    return this.filterState.get(type) !== false;
  }

  public isFilterIndeterminate(type: string): boolean {
    if (type === "portals") {
      const states = PORTAL_LEVELS.map(l => this.filterState.get(`portals-level-${l}`) !== false);
      states.push(this.filterState.get("portals-placeholder") !== false);
      const visibleCount = states.filter(v => v).length;
      return visibleCount > 0 && visibleCount < states.length;
    }
    return false;
  }

  public getOrCreateSource(name: string): Cesium.CustomDataSource {
    let source = this.sources.get(name);
    if (!source) {
      source = new Cesium.CustomDataSource(name);
      // Apply saved visibility or default to true
      source.show = this.sourceVisibility.has(name)
        ? this.sourceVisibility.get(name)!
        : true;

      this.sources.set(name, source);
      this.viewer.dataSources.add(source).then();
    }
    return source;
  }

  public setSourceVisible(name: string, visible: boolean): void {
    this.sourceVisibility.set(name, visible);
    const source = this.sources.get(name);
    if (source) {
      source.show = visible;
      this.viewer.scene.requestRender();
    }
  }

  private applyFilters(): void {
    const teams = TEAMS.map(t => t.toLowerCase());

    teams.forEach(t => {
      const teamVisible = this.filterState.get(`team-${t}`) !== false;

      // Portals
      PORTAL_LEVELS.forEach(l => {
        const levelVisible = this.filterState.get(`portals-level-${l}`) !== false;
        this.setSourceVisible(`portals-l${l}-${t}`, teamVisible && levelVisible);
      });

      // Placeholders
      const placeholdersVisible = this.filterState.get("portals-placeholder") !== false;
      this.setSourceVisible(`portals-placeholder-${t}`, teamVisible && placeholdersVisible);

      // Links
      const linksVisible = this.filterState.get("links") !== false;
      this.setSourceVisible(`links-${t}`, teamVisible && linksVisible);

      // Fields
      const fieldsVisible = this.filterState.get("fields") !== false;
      this.setSourceVisible(`fields-${t}`, teamVisible && fieldsVisible);
    });

    // History
    const historyVisible = this.filterState.get("history") !== false;
    this.setSourceVisible("history-visited-captured", historyVisible);

    // History Reverse
    const historyReverseVisible = this.filterState.get("history-reverse") !== false;
    this.setSourceVisible("history-visited-captured-reverse", historyReverseVisible);

    // Scout Control History
    const scoutControlVisible = this.filterState.get("scout-control") !== false;
    this.setSourceVisible("history-scout-control", scoutControlVisible);

    // Scout Control Reverse
    const scoutControlReverseVisible = this.filterState.get("scout-control-reverse") !== false;
    this.setSourceVisible("history-scout-control-reverse", scoutControlReverseVisible);

    // Debug tiles
    const debugTilesVisible = this.filterState.get("debug-tiles") !== false;
    this.setSourceVisible("debug-tiles", debugTilesVisible);

    this.viewer.scene.requestRender();
  }
}
