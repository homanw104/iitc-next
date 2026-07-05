/**
 * Applies parsed tile data to Cesium entity managers.
 */

import type * as Cesium from "cesium";
import type { FieldData } from "../../types/iitc/field.ts";
import type { LinkData } from "../../types/iitc/link.ts";
import type { PortalData } from "../../types/iitc/portal.ts";
import type { TileResponse } from "../../types/api/getEntities.ts";
import type { FieldEntityManager } from "../entity/fieldEntityManager";
import type { LinkEntityManager } from "../entity/linkEntityManager";
import type { PortalEntityManager } from "../entity/portalEntityManager";
import type { PortalHistoryEntityManager } from "../entity/portalHistoryEntityManager";
import type { PortalLabelEntityManager } from "../entity/portalLabelEntityManager";
import type { PortalOrnamentEntityManager } from "../entity/portalOrnamentEntityManager";
import type { ScoutHistoryEntityManager } from "../entity/scoutHistoryEntityManager";
import { logManager } from "../system/logManager";
import { parseTileEntities } from "./tileRequestEntityParser";
import type { TileRequestQueue } from "./tileRequestQueue";

const LOG_TAG = "TileRequestEntityHydrator";
const PORTAL_HYDRATION_BATCH_SIZE = 64;
const LINK_HYDRATION_BATCH_SIZE = 128;
const FIELD_HYDRATION_BATCH_SIZE = 128;

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
            portal.timestamp && portal.timestamp > (existing.timestamp ?? 0)
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

    attachLinksToExistingPortals(portalsToHydrate, linksToHydrate);
    attachFieldsToExistingPortals(portalsToHydrate, fieldsToHydrate);

    const portals = Array.from(portalsToHydrate.values());
    await hydrateInBatches(portals, PORTAL_HYDRATION_BATCH_SIZE, async (batch) => {
      await Promise.all([
        this.portalEntityManager.addOrUpdatePortals(batch),
        this.portalLabelEntityManager.addOrUpdateLabels(batch),
        this.portalOrnamentEntityManager.addOrUpdateOrnaments(batch),
        this.portalHistoryEntityManager.addOrUpdateHistoryHalos(batch),
        this.scoutHistoryEntityManager.addOrUpdateScoutControlHalos(batch),
      ]);
    });
    await hydrateInBatches(Array.from(linksToHydrate.values()), LINK_HYDRATION_BATCH_SIZE, (batch) =>
      this.linkEntityManager.addOrUpdateLinks(batch)
    );
    await hydrateInBatches(Array.from(fieldsToHydrate.values()), FIELD_HYDRATION_BATCH_SIZE, (batch) =>
      this.fieldEntityManager.addOrUpdateFields(batch)
    );

    logManager.debug(LOG_TAG, `Processed ${entitiesFound} entities`);
    this.viewer.scene.requestRender();
  }
}

function attachLinksToExistingPortals(
  portals: Map<string, PortalData>,
  links: Map<string, LinkData>,
): void {
  for (const link of links.values()) {
    attachLinkToPortal(portals.get(link.oGuid), link);
    attachLinkToPortal(portals.get(link.dGuid), link);
  }
}

function attachFieldsToExistingPortals(
  portals: Map<string, PortalData>,
  fields: Map<string, FieldData>,
): void {
  for (const field of fields.values()) {
    for (const point of field.points) {
      attachFieldToPortal(portals.get(point.guid), field);
    }
  }
}

function attachLinkToPortal(portal: PortalData | undefined, link: LinkData): void {
  if (!portal) return;
  if (portal.links?.some((existingLink) => existingLink.guid === link.guid)) return;

  (portal.links ??= []).push(link);
}

function attachFieldToPortal(portal: PortalData | undefined, field: FieldData): void {
  if (!portal) return;
  if (portal.fields?.some((existingField) => existingField.guid === field.guid)) return;

  (portal.fields ??= []).push(field);
}

async function hydrateInBatches<T>(
  items: T[],
  batchSize: number,
  hydrate: (batch: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await hydrate(items.slice(index, index + batchSize));
    if (index + batchSize < items.length) await waitForNextFrame();
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}
