import * as Cesium from "cesium";
import { FieldData } from "../types/ingress";
import { getTeamColor } from "../utils/color";
import { LayerManager } from "./layerManager";
import { PortalManager } from "./portalManager";

export class FieldManager {
  private fields: Map<string, { data: FieldData; entity: Cesium.Entity }> = new Map();

  constructor(private layerManager: LayerManager, private portalManager: PortalManager) {}

  public addOrUpdateField(data: FieldData): void {
    data.points.forEach((p) => {
      this.portalManager.createPortalPlaceholderEntity(p.guid, data.team, p.latE6, p.lngE6);
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

  public removeField(guid: string): boolean {
    const fieldInfo = this.fields.get(guid);
    if (fieldInfo) {
      const layerId = this.getFieldLayerId(fieldInfo.data);
      this.layerManager.getOrCreateSource(layerId).entities.remove(fieldInfo.entity);
      this.fields.delete(guid);
      return true;
    }
    return false;
  }

  private createFieldEntity(data: FieldData): Cesium.Entity {
    const layerId = this.getFieldLayerId(data);
    const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
    return this.layerManager.getOrCreateSource(layerId).entities.add({
      id: `field-${data.guid}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)),
        material: getTeamColor(data.team).withAlpha(0.2),
        outline: false,
      },
    });
  }

  private updateFieldEntity(entity: Cesium.Entity, data: FieldData): void {
    if (entity.polygon) {
      const points = data.points.flatMap(p => [p.lngE6 / 1e6, p.latE6 / 1e6]);
      entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(points)));
      entity.polygon.material = new Cesium.ColorMaterialProperty(getTeamColor(data.team).withAlpha(0.2));
    }
  }

  private getFieldLayerId(data: FieldData): string {
    const team = data.team.toLowerCase();
    return `fields-${team}`;
  }
}
