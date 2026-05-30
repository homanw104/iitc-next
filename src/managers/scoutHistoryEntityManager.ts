/**
 * Manages entities representing scout control history of portals.
 */

import * as Cesium from "cesium";
import { PortalData } from "../types/ingress";
import { LayerManager } from "./layerManager";

export class ScoutHistoryEntityManager {

  constructor(private layerManager: LayerManager) {}

  public addOrUpdateScoutControlHalo(data: PortalData): void {
    const scoutHaloId = `portal-${data.guid}-scout-halo`;
    const scoutHaloIdReverse = `portal-${data.guid}-scout-halo-reverse`;
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
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
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
          position: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6),
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

  public removeScoutControlHalo(guid: string): void {
    const scoutHaloId = `portal-${guid}-scout-halo`;
    const scoutHaloIdReverse = `portal-${guid}-scout-halo-reverse`;
    this.layerManager.getOrCreateSource("history-scout-control").entities.removeById(scoutHaloId);
    this.layerManager.getOrCreateSource("history-scout-control-reverse").entities.removeById(scoutHaloIdReverse);
  }

  public removeScoutControlHaloInView(viewRect: Cesium.Rectangle): void {
    const source = this.layerManager.getOrCreateSource("history-scout-control");
    const sourceReverse = this.layerManager.getOrCreateSource("history-scout-control-reverse");
    source.entities.values.forEach(entity => {
      if (entity.position) {
        const position = entity.position.getValue(Cesium.JulianDate.now());
        if (position) {
          const cartographic = Cesium.Cartographic.fromCartesian(position);
          if (Cesium.Rectangle.contains(viewRect, cartographic)) {
            source.entities.remove(entity);
          }
        }
      }
    });
    sourceReverse.entities.values.forEach(entity => {
      if (entity.position) {
        const position = entity.position.getValue(Cesium.JulianDate.now());
        if (position) {
          const cartographic = Cesium.Cartographic.fromCartesian(position);
          if (Cesium.Rectangle.contains(viewRect, cartographic)) {
            sourceReverse.entities.remove(entity);
          }
        }
      }
    });
  }
}
