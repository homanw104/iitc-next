/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { PortalData, LinkData, FieldData, TEAMS, PORTAL_LEVELS } from "../types/ingress";
import { LayerManager } from "./layerManager";
import { PortalEntityManager } from "./portalEntityManager";
import { LinkEntityManager } from "./linkEntityManager";
import { FieldEntityManager } from "./fieldEntityManager";
import { PortalHistoryEntityManager } from "./portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "./scoutHistoryEntityManager";

/**
 * Manages game entities and their Cesium representations.
 */
export class EntityManager {
  private viewer: Cesium.Viewer;

  public readonly layerManager: LayerManager;
  public readonly portalManager: PortalEntityManager;
  public readonly linkManager: LinkEntityManager;
  public readonly fieldManager: FieldEntityManager;
  public readonly historyManager: PortalHistoryEntityManager;
  public readonly scoutControlHistoryManager: ScoutHistoryEntityManager;

  private filterState: Map<string, boolean> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.layerManager = new LayerManager(viewer);
    this.portalManager = new PortalEntityManager(this.layerManager);
    this.linkManager = new LinkEntityManager(this.layerManager, this.portalManager);
    this.fieldManager = new FieldEntityManager(this.layerManager, this.portalManager);
    this.historyManager = new PortalHistoryEntityManager(this.layerManager);
    this.scoutControlHistoryManager = new ScoutHistoryEntityManager(this.layerManager);

    TEAMS.forEach(t => this.filterState.set(`team-${t.toLowerCase()}`, true));
    PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, true));
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
    const isSelected = this.viewer.selectedEntity?.id === `portal-${data.guid}`;
    const entity = this.portalManager.addOrUpdatePortal(data);
    if (isSelected && this.viewer.selectedEntity !== entity) {
      this.viewer.selectedEntity = entity;
    }

    // Update history and scout control if portal was updated and has history data
    if (entity) {
      this.historyManager.addOrUpdateHistoryHalo(entity, data);
      this.scoutControlHistoryManager.addOrUpdateScoutControlHalo(entity, data);
    }
  }

  public addOrUpdateLink(data: LinkData): void {
    const isSelected = this.viewer.selectedEntity?.id === `link-${data.guid}`;
    const entity = this.linkManager.addOrUpdateLink(data);
    if (isSelected && this.viewer.selectedEntity !== entity) {
      this.viewer.selectedEntity = entity;
    }
  }

  public addOrUpdateField(data: FieldData): void {
    const isSelected = this.viewer.selectedEntity?.id === `field-${data.guid}`;
    const entity = this.fieldManager.addOrUpdateField(data);
    if (isSelected && this.viewer.selectedEntity !== entity) {
      this.viewer.selectedEntity = entity;
    }
  }

  public async requestPortalDetails(guid: string): Promise<PortalData> {
    const isSelected = this.viewer.selectedEntity?.id === `portal-${guid}`;
    const portalData = await this.portalManager.requestPortalDetails(guid);
    const entity = this.portalManager.getPortalEntity(guid);

    if (entity) {
      this.historyManager.addOrUpdateHistoryHalo(entity, portalData);
      this.scoutControlHistoryManager.addOrUpdateScoutControlHalo(entity, portalData);
    }

    if (isSelected && this.viewer.selectedEntity !== entity) {
      this.viewer.selectedEntity = this.portalManager.getPortalEntity(guid);
    }
    return portalData;
  }

  public getPortalData(guid: string): PortalData | undefined {
    return this.portalManager.getPortalData(guid);
  }

  public removeGameEntity(guid: string): void {
    if (this.portalManager.removePortal(guid)) return;
    if (this.linkManager.removeLink(guid)) return;
    if (this.fieldManager.removeField(guid)) return;
  }

  public setLayerVisible(type: string, visible: boolean): void {
    if (type === "portals") {
      PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, visible));
      this.filterState.set("portals-placeholder", visible);
    }
    this.filterState.set(type, visible);
    this.applyFilters();
  }

  public isLayerVisible(type: string): boolean {
    if (type === "portals") {
      const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`level-${l}`) !== false);
      const placeholder = this.filterState.get("portals-placeholder") !== false;
      return allLevels && placeholder;
    }
    return this.filterState.get(type) !== false;
  }

  public isLayerIndeterminate(type: string): boolean {
    if (type === "portals") {
      const states = PORTAL_LEVELS.map(l => this.filterState.get(`level-${l}`) !== false);
      states.push(this.filterState.get("portals-placeholder") !== false);
      const visibleCount = states.filter(v => v).length;
      return visibleCount > 0 && visibleCount < states.length;
    }
    return false;
  }

  private applyFilters(): void {
    const teams = TEAMS.map(t => t.toLowerCase());

    teams.forEach(t => {
      const teamVisible = this.filterState.get(`team-${t}`) !== false;

      // Portals
      PORTAL_LEVELS.forEach(l => {
        const levelVisible = this.filterState.get(`level-${l}`) !== false;
        this.layerManager.setLayerVisible(`portals-l${l}-${t}`, teamVisible && levelVisible);
      });

      // Placeholders
      const placeholdersVisible = this.filterState.get("portals-placeholder") !== false;
      this.layerManager.setLayerVisible(`portals-placeholder-${t}`, teamVisible && placeholdersVisible);

      // Links
      const linksVisible = this.filterState.get("links") !== false;
      this.layerManager.setLayerVisible(`links-${t}`, teamVisible && linksVisible);

      // Fields
      const fieldsVisible = this.filterState.get("fields") !== false;
      this.layerManager.setLayerVisible(`fields-${t}`, teamVisible && fieldsVisible);
    });

    // History
    const historyVisible = this.filterState.get("history") !== false;
    this.layerManager.setLayerVisible("history-visited-captured", historyVisible);
    const historyReverseVisible = this.filterState.get("history-reverse") !== false;
    this.layerManager.setLayerVisible("history-visited-captured-reverse", historyReverseVisible);

    // Scout Control History
    const scoutControlVisible = this.filterState.get("scout-control") !== false;
    this.layerManager.setLayerVisible("history-scout-control", scoutControlVisible);
    const scoutControlReverseVisible = this.filterState.get("scout-control-reverse") !== false;
    this.layerManager.setLayerVisible("history-scout-control-reverse", scoutControlReverseVisible);

    // Debug
    const debugTilesVisible = this.filterState.get("debug-tiles") !== false;
    this.layerManager.setLayerVisible("debug-tiles", debugTilesVisible);

    this.viewer.scene.requestRender();
  }
}
