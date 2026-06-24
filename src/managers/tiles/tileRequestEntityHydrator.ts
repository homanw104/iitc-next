/**
 * Applies parsed tile data to Cesium entity managers.
 */

import * as Cesium from "cesium";
import { FieldData, LinkData, PortalData, TileResponse } from "../../types/ingress";
import { FieldEntityManager } from "../entity/fieldEntityManager";
import { LinkEntityManager } from "../entity/linkEntityManager";
import { logManager } from "../system/logManager";
import { PortalEntityManager } from "../entity/portalEntityManager";
import { PortalHistoryEntityManager } from "../entity/portalHistoryEntityManager";
import { PortalLabelEntityManager } from "../entity/portalLabelEntityManager";
import { PortalOrnamentEntityManager } from "../entity/portalOrnamentEntityManager";
import { ScoutHistoryEntityManager } from "../entity/scoutHistoryEntityManager";
import type { TileRequestQueue } from "./tileRequestQueue";
import { parseTileEntities } from "./tileRequestEntityParser";

const LOG_TAG = "TileRequestEntityHydrator";

export class TileEntityHydrator {
  constructor(
    private readonly viewer: Cesium.Viewer,
    private readonly portalEntityManager: PortalEntityManager,
    private readonly portalLabelEntityManager: PortalLabelEntityManager,
    private readonly portalOrnamentEntityManager: PortalOrnamentEntityManager,
    private readonly portalHistoryEntityManager: PortalHistoryEntityManager,
    private readonly scoutHistoryEntityManager: ScoutHistoryEntityManager,
    private readonly linkEntityManager: LinkEntityManager,
    private readonly fieldEntityManager: FieldEntityManager,
  ) {}

  public removeEntitiesInView(viewRect: Cesium.Rectangle): void {
    this.portalEntityManager.removePortalsInView(viewRect);
    this.portalLabelEntityManager.removeLabelsInView(viewRect);
    this.portalOrnamentEntityManager.removeOrnamentsInView(viewRect);
    this.portalHistoryEntityManager.removeHistoryHalosInView(viewRect);
    this.scoutHistoryEntityManager.removeScoutControlHalosInView(viewRect);
    this.linkEntityManager.removeLinksInView(viewRect);
    this.fieldEntityManager.removeFieldsInView(viewRect);
    logManager.debug(LOG_TAG, "Removed entities from current view");
  }

  public async handleResponse(data: TileResponse, tileKeys: string[], queue: TileRequestQueue): Promise<void> {
    if (!data || !data.result?.map) {
      logManager.warn(LOG_TAG, "Invalid response data:", data);
      tileKeys.forEach((key) => {
        queue.forgetRequestedTile(key);
        queue.setTileStatus(key, "error");
      });
      return;
    }

    let entitiesFound = 0;
    const portalsToHydrate: Map<string, PortalData> = new Map();
    const linksToHydrate: Map<string, LinkData> = new Map();
    const fieldsToHydrate: Map<string, FieldData> = new Map();

    for (const tileKey of tileKeys) {
      const tileData = data.result.map[tileKey];
      if (!tileData) {
        queue.forgetRequestedTile(tileKey);
        queue.setTileStatus(tileKey, "error");
        continue;
      }

      if (tileData.error) {
        // Ignore TIMEOUT errors from Niantic's internal server (which seems like intended)
        // and delete them from the requestedTiles for further retrying
        if (tileData.error == "TIMEOUT") {
          queue.setTileStatus(tileKey, "loaded");
        } else {
          logManager.warn(LOG_TAG, `Tile ${tileKey} failed: ${tileData.error}`);
          queue.setTileStatus(tileKey, "error");
        }
        queue.forgetRequestedTile(tileKey);
        continue;
      }

      queue.setTileStatus(tileKey, "loaded");

      if (tileData.gameEntities) {
        entitiesFound += tileData.gameEntities.length;
        const { portals, links, fields } = parseTileEntities(tileData.gameEntities);
        portals.forEach((portal) => {
          const existing = portalsToHydrate.get(portal.guid);
          if (
            !existing ||
            existing.isPlaceholder ||
            portal.timestamp > existing.timestamp ||
            (!existing.resonators && portal.resonators)
          ) {
            portalsToHydrate.set(portal.guid, portal);
          }
        });
        links.forEach((link) => {
          const existing = linksToHydrate.get(link.guid);
          if (!existing || link.timestamp > existing.timestamp) {
            linksToHydrate.set(link.guid, link);
          }
        });
        fields.forEach((field) => {
          const existing = fieldsToHydrate.get(field.guid);
          if (!existing || field.timestamp > existing.timestamp) {
            fieldsToHydrate.set(field.guid, field);
          }
        });
      }
    }

    const portals = Array.from(portalsToHydrate.values());
    await Promise.all(portals.map((p) => this.portalEntityManager.addOrUpdatePortal(p)));
    await Promise.all(portals.map((p) => this.portalLabelEntityManager.addOrUpdateLabel(p)));
    await Promise.all(portals.map((p) => this.portalOrnamentEntityManager.addOrUpdateOrnament(p)));
    await Promise.all(portals.map((p) => this.portalHistoryEntityManager.addOrUpdateHistoryHalo(p)));
    await Promise.all(portals.map((p) => this.scoutHistoryEntityManager.addOrUpdateScoutControlHalo(p)));
    linksToHydrate.forEach((l) => this.linkEntityManager.addOrUpdateLink(l));
    fieldsToHydrate.forEach((f) => this.fieldEntityManager.addOrUpdateField(f));

    logManager.debug(LOG_TAG, `Processed ${entitiesFound} entities`);
    this.viewer.scene.requestRender();
  }
}
