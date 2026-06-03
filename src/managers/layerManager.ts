/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { TEAMS, PORTAL_LEVELS } from "../types/ingress";

export class LayerManager {
  private viewer: Cesium.Viewer;

  // Maps sourceVisibility keys to Cesium Sources (layers)
  private sources: Map<string, Cesium.CustomDataSource> = new Map();

  // Granular controls (portals-l8-enlightened, portals-placeholder-resistance, etc.)
  private sourceVisibility: Map<string, boolean> = new Map();

  // Upper level controls (portals, links, fields)
  private filterState: Map<string, boolean> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;

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

  public setFilter(type: string, enabled: boolean): void {
    if (type === "portals") {
      PORTAL_LEVELS.forEach(l => this.filterState.set(`level-${l}`, enabled));
      this.filterState.set("portals-placeholder", enabled);
    }
    this.filterState.set(type, enabled);
    this.applyFilters();
  }

  public isFilterEnabled(type: string): boolean {
    if (type === "portals") {
      const allLevels = PORTAL_LEVELS.every(l => this.filterState.get(`level-${l}`) !== false);
      const placeholder = this.filterState.get("portals-placeholder") !== false;
      return allLevels && placeholder;
    }
    return this.filterState.get(type) !== false;
  }

  public isFilterIndeterminate(type: string): boolean {
    if (type === "portals") {
      const states = PORTAL_LEVELS.map(l => this.filterState.get(`level-${l}`) !== false);
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
        const levelVisible = this.filterState.get(`level-${l}`) !== false;
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
