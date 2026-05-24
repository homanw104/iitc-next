/**
 * Parser for Niantic's raw entity data.
 */

import { PortalData, LinkData, FieldData, RawEntity, Team } from "../types/ingress";

export function parsePortal(ent: RawEntity): PortalData {
  const [guid, timestamp, data] = ent;
  const team = data[1] as Team;
  const latE6 = data[2] as number;
  const lngE6 = data[3] as number;

  const portal: PortalData = {
    guid,
    timestamp,
    team,
    latE6,
    lngE6,
  };

  if (data.length >= 14) {
    portal.level = data[4] as number;
    portal.health = data[5] as number;
    portal.resCount = data[6] as number;
    portal.image = data[7] as string;
    portal.title = data[8] as string;
  }

  return portal;
}

export function parseLink(ent: RawEntity): LinkData {
  const [guid, timestamp, data] = ent;
  return {
    guid,
    timestamp,
    team: data[1] as Team,
    oGuid: data[2] as string,
    oLatE6: data[3] as number,
    oLngE6: data[4] as number,
    dGuid: data[5] as string,
    dLatE6: data[6] as number,
    dLngE6: data[7] as number,
  };
}

export function parseField(ent: RawEntity): FieldData {
  const [guid, timestamp, data] = ent;
  const team = data[1] as Team;
  const points = (data[2] as unknown[][]).map((p) => ({
    guid: p[0] as string,
    latE6: p[1] as number,
    lngE6: p[2] as number,
  }));

  return {
    guid,
    timestamp,
    team,
    points,
  };
}

export interface ParsedEntities {
  portals: PortalData[];
  links: LinkData[];
  fields: FieldData[];
}

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
