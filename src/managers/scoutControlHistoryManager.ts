/**
 * Manages entities representing scout control history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";

export class ScoutControlHistoryManager {

  constructor(private layerManager: LayerManager) {}

  public addOrUpdateScoutControlHalo(entity: Cesium.Entity, data: PortalData): void {
    if (!data.history) return;

    const scoutHaloId = `${entity.id}-scout-halo`;
    const source = this.layerManager.getOrCreateSource("history-scout-control");
    let scoutHalo = source.entities.getById(scoutHaloId);

    if (data.history.scoutControlled) {
      if (!scoutHalo) {
        source.entities.add({
          id: scoutHaloId,
          position: entity.position,
          point: {
            pixelSize: 24,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: Cesium.Color.fromCssColorString("#FF9000"),
            outlineWidth: 2,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      }
    } else if (scoutHalo) {
      source.entities.remove(scoutHalo);
    }
  }
}
