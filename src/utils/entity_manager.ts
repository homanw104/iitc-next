/**
 * Manages game entities and their Cesium representations.
 */

import * as Cesium from "cesium";
import { PortalData, LinkData, FieldData, Team } from "../types/ingress";

export class EntityManager {
  private viewer: Cesium.Viewer;
  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();
  private links: Map<string, { data: LinkData; entity: Cesium.Entity }> = new Map();
  private fields: Map<string, { data: FieldData; entity: Cesium.Entity }> = new Map();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  public addOrUpdatePortal(data: PortalData): void {
    const existing = this.portals.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        this.updatePortalEntity(existing.entity, data);
        existing.data = data;
      }
      return;
    }

    const entity = this.viewer.entities.add({
      id: `portal-${data.guid}`,
      position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
      point: {
        pixelSize: 8,
        color: this.getTeamColor(data.team),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: data.title || "",
        font: "12px sans-serif",
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // Ensure label is visible
      },
    });

    this.portals.set(data.guid, { data, entity });
  }

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(this.getTeamColor(data.team));
    }
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(data.title || "");
    }
  }

  public addOrUpdateLink(data: LinkData): void {
    const existing = this.links.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        existing.data = data;
        // Polylines are updated via their positions property if needed, 
        // but link positions rarely change for same GUID.
      }
      return;
    }

    const entity = this.viewer.entities.add({
      id: `link-${data.guid}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          data.oLngE6 / 1e6, data.oLatE6 / 1e6,
          data.dLngE6 / 1e6, data.dLatE6 / 1e6
        ]),
        width: 2,
        material: this.getTeamColor(data.team).withAlpha(0.7),
      },
    });

    this.links.set(data.guid, { data, entity });
  }

  public addOrUpdateField(data: FieldData): void {
    const existing = this.fields.get(data.guid);
    if (existing) {
      if (data.timestamp > existing.data.timestamp) {
        existing.data = data;
      }
      return;
    }

    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    const entity = this.viewer.entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)),
        material: this.getTeamColor(data.team).withAlpha(0.2),
        outline: false,
      },
    });

    this.fields.set(data.guid, { data, entity });
  }

  public removeEntity(guid: string): void {
    if (this.portals.has(guid)) {
      this.viewer.entities.remove(this.portals.get(guid)!.entity);
      this.portals.delete(guid);
    } else if (this.links.has(guid)) {
      this.viewer.entities.remove(this.links.get(guid)!.entity);
      this.links.delete(guid);
    } else if (this.fields.has(guid)) {
      this.viewer.entities.remove(this.fields.get(guid)!.entity);
      this.fields.delete(guid);
    }
  }

  private getTeamColor(team: Team): Cesium.Color {
    switch (team) {
      case "ENLIGHTENED": return Cesium.Color.LIME;
      case "RESISTANCE": return Cesium.Color.BLUE;
      case "NEUTRAL": return Cesium.Color.LIGHTGRAY;
      default: return Cesium.Color.WHITE;
    }
  }
}
