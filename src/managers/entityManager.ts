/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { PortalData, LinkData, FieldData, Team } from "../types/ingress";
import { logManager } from "./logManager";
import { LayerManager } from "./layerManager";

/**
 * Manages game entities and their Cesium representations.
 */
export class EntityManager {
  private viewer: Cesium.Viewer;
  private layerManager: LayerManager;

  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();
  private links: Map<string, { data: LinkData; entity: Cesium.Entity }> = new Map();
  private fields: Map<string, { data: FieldData; entity: Cesium.Entity }> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.layerManager = new LayerManager(viewer);
  }

  public requestRender(): void {
    this.viewer.scene.requestRender();
  }

  public addOrUpdatePortal(data: PortalData): void {
    const existing = this.portals.get(data.guid);
    if (existing) {
      if (data.placeholder) return; // Don't downgrade full portal to placeholder
      if (existing.data.placeholder || data.timestamp > existing.data.timestamp) {
        const oldLayerId = this.getPortalLayerId(existing.data);
        const newLayerId = this.getPortalLayerId(data);

        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSource(oldLayerId).entities.remove(existing.entity);
          existing.entity = this.createPortalEntity(data);
        } else {
          this.updatePortalEntity(existing.entity, data);
        }
        existing.data = data;
      }
      return;
    }

    const portalEntity = this.createPortalEntity(data);
    logManager.debug("EntityManager", `Added portal: ${data.title || data.guid} at ${data.latE6 / 1e6}, ${data.lngE6 / 1e6}`);
    this.portals.set(data.guid, { data, entity: portalEntity });
  }


  public addOrUpdateLink(data: LinkData): void {
    this.createPortalPlaceholderEntity(data.oGuid, data.team, data.oLatE6, data.oLngE6);
    this.createPortalPlaceholderEntity(data.dGuid, data.team, data.dLatE6, data.dLngE6);

    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const oldLayerId = this.getLinkLayerId(existing.data);
        const newLayerId = this.getLinkLayerId(data);

        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSource(oldLayerId).entities.remove(existing.entity);
          existing.entity = this.createLinkEntity(data);
        } else {
          this.updateLinkEntity(existing.entity, data);
        }
        existing.data = data;
      }
      return;
    }

    const entity = this.createLinkEntity(data);
    this.links.set(data.guid, { data, entity });
  }

  public addOrUpdateField(data: FieldData): void {
    data.points.forEach((p) => {
      this.createPortalPlaceholderEntity(p.guid, data.team, p.latE6, p.lngE6);
    });

    const existing = this.fields.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        const oldLayerId = this.getFieldLayerId(existing.data);
        const newLayerId = this.getFieldLayerId(data);

        if (oldLayerId !== newLayerId) {
          this.layerManager.getOrCreateSource(oldLayerId).entities.remove(existing.entity);
          existing.entity = this.createFieldEntity(data);
        } else {
          this.updateFieldEntity(existing.entity, data);
        }
        existing.data = data;
      }
      return;
    }

    const entity = this.createFieldEntity(data);
    this.fields.set(data.guid, { data, entity });
  }

  private createPortalEntity(data: PortalData): Cesium.Entity {
    const layerId = this.getPortalLayerId(data);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `portal-${data.guid}`,
      position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
      point: {
        pixelSize: 16,
        scaleByDistance: new Cesium.NearFarScalar(1e2, 1.0, 1e4, 0.25),
        color: this.getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: data.title || "",
        font: "12px sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        eyeOffset: new Cesium.Cartesian3(0, 0, -10),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        outlineWidth: 4,
        outlineColor: Cesium.Color.BLACK,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        translucencyByDistance: new Cesium.NearFarScalar(1e3, 1.0, 1.5e3, 0.0),
      },
    });
  }

  private createLinkEntity(data: LinkData): Cesium.Entity {
    const layerId = this.getLinkLayerId(data);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `link-${data.guid}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          data.oLngE6 / 1e6, data.oLatE6 / 1e6,
          data.dLngE6 / 1e6, data.dLatE6 / 1e6
        ]),
        width: 2,
        material: this.getTeamColor(data.team).withAlpha(0.7),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  }

  private createFieldEntity(data: FieldData): Cesium.Entity {
    const layerId = this.getFieldLayerId(data);
    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)),
        material: this.getTeamColor(data.team).withAlpha(0.2),
        outline: false,
      },
    });
  }

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(this.getTeamColor(data.team));
    }
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(data.title || "");
    }
  }

  private updateLinkEntity(entity: Cesium.Entity, data: LinkData): void {
    if (entity.polyline) {
      entity.polyline.positions = new Cesium.ConstantProperty(Cesium.Cartesian3.fromDegreesArray([
        data.oLngE6 / 1e6, data.oLatE6 / 1e6,
        data.dLngE6 / 1e6, data.dLatE6 / 1e6
      ]));
      entity.polyline.material = new Cesium.ColorMaterialProperty(this.getTeamColor(data.team).withAlpha(0.7));
    }
  }

  private updateFieldEntity(entity: Cesium.Entity, data: FieldData): void {
    if (entity.polygon) {
      const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
      entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)));
      entity.polygon.material = new Cesium.ColorMaterialProperty(this.getTeamColor(data.team).withAlpha(0.2));
    }
  }

  private createPortalPlaceholderEntity(guid: string, team: Team, latE6: number, lngE6: number): void {
    // Ensure the portal does not exist as a full portal before adding a placeholder
    if (this.portals.has(guid)) return;

    this.addOrUpdatePortal({
      guid,
      team,
      latE6,
      lngE6,
      timestamp: 0,
      placeholder: true,
    });
  }

  public removeEntity(guid: string): void {
    if (this.portals.has(guid)) {
      const portalInfo = this.portals.get(guid)!;
      const layerId = this.getPortalLayerId(portalInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(portalInfo.entity);
      this.portals.delete(guid);
    } else if (this.links.has(guid)) {
      const linkInfo = this.links.get(guid)!;
      const layerId = this.getLinkLayerId(linkInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(linkInfo.entity);
      this.links.delete(guid);
    } else if (this.fields.has(guid)) {
      const fieldInfo = this.fields.get(guid)!;
      const layerId = this.getFieldLayerId(fieldInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(fieldInfo.entity);
      this.fields.delete(guid);
    }
  }

  private getPortalLayerId(data: PortalData): string {
    if (data.placeholder) {
      return "portals-placeholder";
    }
    const level = data.level ?? 0;
    const team = data.team.toLowerCase();
    return `portals-l${level}-${team}`;
  }

  private getLinkLayerId(data: LinkData): string {
    const team = data.team.toLowerCase();
    return `links-${team}`;
  }

  private getFieldLayerId(data: FieldData): string {
    const team = data.team.toLowerCase();
    return `fields-${team}`;
  }

  public setLayerVisible(type: string, visible: boolean): void {
    if (type === "portals") {
      // For legacy/convenience, toggle all portal layers
      for (const name of this.layerManager.getSources().keys()) {
        if (name.startsWith("portals-")) {
          this.layerManager.setLayerVisible(name, visible);
        }
      }
      return;
    }
    if (type === "links") {
      for (const name of this.layerManager.getSources().keys()) {
        if (name.startsWith("links-")) {
          this.layerManager.setLayerVisible(name, visible);
        }
      }
      return;
    }
    if (type === "fields") {
      for (const name of this.layerManager.getSources().keys()) {
        if (name.startsWith("fields-")) {
          this.layerManager.setLayerVisible(name, visible);
        }
      }
      return;
    }
    this.layerManager.setLayerVisible(type, visible);
  }

  public isLayerVisible(type: string): boolean {
    if (type === "portals") {
      // For legacy/convenience, "portals" returns true if any portal layer is visible
      for (const [name, source] of this.layerManager.getSources()) {
        if (name.startsWith("portals-") && source.show) return true;
      }
      return false;
    }
    if (type === "links") {
      for (const [name, source] of this.layerManager.getSources()) {
        if (name.startsWith("links-") && source.show) return true;
      }
      return false;
    }
    if (type === "fields") {
      for (const [name, source] of this.layerManager.getSources()) {
        if (name.startsWith("fields-") && source.show) return true;
      }
      return false;
    }
    return this.layerManager.isLayerVisible(type);
  }

  private getTeamColor(team: Team): Cesium.Color {
    switch (team) {
      case "ENLIGHTENED": return new Cesium.Color(5/255, 217/255, 3/255, 1.0);
      case "RESISTANCE": return new Cesium.Color(3/255, 139/255, 255/255, 1.0);
      case "MACHINA": return new Cesium.Color(255/255, 0/255, 41/255, 1.0);
      case "NEUTRAL": return Cesium.Color.LIGHTGRAY;
      default: return Cesium.Color.WHITE;   // Should never happen
    }
  }
}
