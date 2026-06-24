/**
 * Converts raw Intel tile entities into typed map entities.
 */

import { FieldData, LinkData, PortalData, RawEntity } from "../../types/ingress";
import { ParsedEntities } from "../../types/map";
import { parseField } from "../entity/fieldEntityManager";
import { parseLink } from "../entity/linkEntityManager";
import { parsePortal } from "../entity/portalEntityManager";

export function parseTileEntities(entities: RawEntity[]): ParsedEntities {
  const portals: PortalData[] = [];
  const links: LinkData[] = [];
  const fields: FieldData[] = [];

  for (const ent of entities) {
    const type = ent[2][0];
    switch (type) {
      case "p":
        portals.push(parsePortal(ent));
        break;
      case "e":
        links.push(parseLink(ent));
        break;
      case "r":
        fields.push(parseField(ent));
        break;
    }
  }

  return { portals, links, fields };
}
