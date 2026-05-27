/**
 * Manages entities representing visit and capture history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";

export class HistoryManager {

  constructor(private layerManager: LayerManager) {}

  public addOrUpdateHistoryHalo(entity: Cesium.Entity, data: PortalData): void {
    if (!data.history) return;

    const historyHaloId = `${entity.id}-history-halo`;
    const source = this.layerManager.getOrCreateSource("history-visited-captured");
    let historyHalo = source.entities.getById(historyHaloId);

    if (data.history.captured || data.history.visited) {
      const color = data.history.captured
        ? Cesium.Color.fromCssColorString("#FF6060")
        : Cesium.Color.fromCssColorString("#FFCE00");

      if (!historyHalo) {
        source.entities.add({
          id: historyHaloId,
          position: entity.position,
          point: {
            pixelSize: 20,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 2,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (historyHalo.point) {
        historyHalo.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    } else if (historyHalo) {
      source.entities.remove(historyHalo);
    }
  }
}
