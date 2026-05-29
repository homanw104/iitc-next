/**
 * Manages entities representing scout control history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";

export class ScoutHistoryEntityManager {

  constructor(private layerManager: LayerManager) {}

  public addOrUpdateScoutControlHalo(entity: Cesium.Entity, data: PortalData): void {
    const scoutHaloId = `${entity.id}-scout-halo`;
    const scoutHaloIdReverse = `${entity.id}-scout-halo-reverse`;
    const source = this.layerManager.getOrCreateSource("history-scout-control");
    const sourceReverse = this.layerManager.getOrCreateSource("history-scout-control-reverse");
    let scoutHalo = source.entities.getById(scoutHaloId);
    let scoutHaloReverse = sourceReverse.entities.getById(scoutHaloIdReverse);

    if (data.history?.scoutControlled) {
      const color = Cesium.Color.fromCssColorString("#FF9000");
      if (scoutHaloReverse) sourceReverse.entities.remove(scoutHaloReverse);
      if (!scoutHalo) {
        source.entities.add({
          id: scoutHaloId,
          position: entity.position,
          point: {
            pixelSize: 24,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (scoutHalo.point) {
        scoutHalo.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    } else {
      const color = Cesium.Color.fromCssColorString("#FF9000");
      if (scoutHalo) source.entities.remove(scoutHalo);
      if (!scoutHaloReverse) {
        sourceReverse.entities.add({
          id: scoutHaloIdReverse,
          position: entity.position,
          point: {
            pixelSize: 24,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (scoutHaloReverse.point) {
        scoutHaloReverse.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    }
  }
}
