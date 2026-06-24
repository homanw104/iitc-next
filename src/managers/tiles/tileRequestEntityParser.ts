/**
 * Converts raw Intel tile entities into typed map entities.
 */

import type { FieldData, LinkData, PortalData, PortalLevel, PortalMod, PortalResonator, RawEntity } from "../../types/ingress";
import type { ParsedEntities } from "../../types/map";

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

export function parsePortal(ent: RawEntity): PortalData {
  const [guid, timestamp, data] = ent;
  const teamCode = data[1] as string;
  const portal: PortalData = {
    guid,
    timestamp,
    team: teamCode === "E" ? "ENLIGHTENED" :
      teamCode === "R" ? "RESISTANCE" :
        teamCode === "M" ? "MACHINA" : "NEUTRAL",
    latE6: data[2] as number,
    lngE6: data[3] as number,
  };

  if (data.length >= 14) {
    portal.level = data[4] as PortalLevel;
    portal.health = data[5] as number;
    portal.resCount = data[6] as number;
    portal.image = data[7] as string;
    portal.title = data[8] as string;
    if (Array.isArray(data[9])) {
      portal.ornaments = data[9] as string[];
    }
  }

  if (data.length >= 18) {
    if (data[14]) {
      portal.mods = (data[14] as unknown[]).map((m): PortalMod | null => {
        if (!Array.isArray(m)) return null;
        return {
          owner: m[0] as string,
          name: m[1] as string,
          rarity: m[2] as string,
          stats: m[3] as Record<string, string>,
        };
      });
    }

    if (data[15]) {
      portal.resonators = (data[15] as unknown[]).map((r): PortalResonator | null => {
        if (!Array.isArray(r)) return null;
        return {
          owner: r[0] as string,
          level: r[1] as number,
          energy: r[2] as number,
        };
      });
    }

    if (data[16]) {
      portal.owner = data[16] as string | undefined;
    }
  }

  if (data.length >= 19) {
    const historyBitArray = (data[18] as number) || 0;
    portal.history = {
      _raw: historyBitArray,
      visited: !!(historyBitArray & 1),
      captured: !!(historyBitArray & 2),
      scoutControlled: !!(historyBitArray & 4),
    };
  }

  return portal;
}

export function parseLink(ent: RawEntity): LinkData {
  const [guid, timestamp, data] = ent;
  const teamCode = data[1] as string;
  return {
    guid,
    timestamp,
    team: teamCode === "E" ? "ENLIGHTENED" :
      teamCode === "R" ? "RESISTANCE" :
        teamCode === "M" ? "MACHINA" : "NEUTRAL",
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
  const teamCode = data[1] as string;
  const team = teamCode === "E" ? "ENLIGHTENED" :
    teamCode === "R" ? "RESISTANCE" :
      teamCode === "M" ? "MACHINA" : "NEUTRAL";
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
