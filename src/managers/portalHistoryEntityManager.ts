/**
 * Manages entities representing visit and capture history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";

export class PortalHistoryEntityManager {

  constructor(private layerManager: LayerManager) {}

  public addOrUpdateHistoryHalo(data: PortalData): void {
    const historyHaloId = `portal-${data.guid}-history-halo`;
    const historyHaloIdReverse = `portal-${data.guid}-history-halo-reverse`;
    const source = this.layerManager.getOrCreateSource("history-visited-captured");
    const sourceReverse = this.layerManager.getOrCreateSource("history-visited-captured-reverse");
    let historyHalo = source.entities.getById(historyHaloId);
    let historyHaloReverse = sourceReverse.entities.getById(historyHaloIdReverse);

    // Captured and visited
    if (data.history?.captured && data.history?.visited) {
      const color = Cesium.Color.fromCssColorString("#FF6060");
      if (historyHaloReverse) sourceReverse.entities.remove(historyHaloReverse);
      if (!historyHalo) {
        source.entities.add({
          id: historyHaloId,
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
          point: {
            pixelSize: 16,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (historyHalo.point) {
        historyHalo.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    }

    // Visited but not captured
    if (!data.history?.captured && data.history?.visited) {
      const color = Cesium.Color.fromCssColorString("#FFCE00");
      if (!historyHalo) {
        source.entities.add({
          id: historyHaloId,
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
          point: {
            pixelSize: 16,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (historyHalo.point) {
        historyHalo.point.outlineColor = new Cesium.ConstantProperty(color);
      }
      if (!historyHaloReverse) {
        sourceReverse.entities.add({
          id: historyHaloIdReverse,
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
          point: {
            pixelSize: 16,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (historyHaloReverse.point) {
        historyHaloReverse.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    }

    // Not visited nor captured
    if (!data.history?.visited) {
      const color = Cesium.Color.fromCssColorString("#FF6060");
      if (historyHalo) source.entities.remove(historyHalo);
      if (!historyHaloReverse) {
        sourceReverse.entities.add({
          id: historyHaloIdReverse,
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
          point: {
            pixelSize: 16,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: color,
            outlineWidth: 4,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
          },
        });
      } else if (historyHaloReverse.point) {
        historyHaloReverse.point.outlineColor = new Cesium.ConstantProperty(color);
      }
    }
  }

  public removeHistoryHalo(guid: string): void {
    const historyHaloId = `portal-${guid}-history-halo`;
    const historyHaloIdReverse = `portal-${guid}-history-halo-reverse`;
    this.layerManager.getOrCreateSource("history-visited-captured").entities.removeById(historyHaloId);
    this.layerManager.getOrCreateSource("history-visited-captured-reverse").entities.removeById(historyHaloIdReverse);
  }
}
