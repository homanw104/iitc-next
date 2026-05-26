import * as Cesium from "cesium";
import { PortalData, Team } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";

export class PortalManager {
  private portals: Map<string, { data: PortalData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager) {}

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
    this.portals.set(data.guid, { data, entity: portalEntity });
  }

  public createPortalPlaceholderEntity(guid: string, team: Team, latE6: number, lngE6: number): void {
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

  public removePortal(guid: string): boolean {
    const portalInfo = this.portals.get(guid);
    if (portalInfo) {
      const layerId = this.getPortalLayerId(portalInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(portalInfo.entity);
      this.portals.delete(guid);
      return true;
    }
    return false;
  }

  private createPortalEntity(data: PortalData): Cesium.Entity {
    const layerId = this.getPortalLayerId(data);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `portal-${data.guid}`,
      position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
      point: {
        pixelSize: 16,
        scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 1e5, 0),
        color: getTeamColor(data.team),
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

  private updatePortalEntity(entity: Cesium.Entity, data: PortalData): void {
    if (entity.point) {
      entity.point.color = new Cesium.ConstantProperty(getTeamColor(data.team));
    }
    if (entity.label) {
      entity.label.text = new Cesium.ConstantProperty(data.title || "");
    }
  }

  private getPortalLayerId(data: PortalData): string {
    const team = data.team.toLowerCase();
    const level = data.level ?? 0;
    if (data.placeholder || level === 0) {
      return `portals-placeholder-${team}`;
    }
    return `portals-l${level}-${team}`;
  }
}
