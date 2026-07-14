/**
 * Converts raw Intel tile entities into typed map entities.
 */

import type { RawEntity } from "../../types/api/getEntities.ts";
import type { PortalLevel } from "../../types/common/common.ts";
import type { FieldData } from "../../types/iitc/field.ts";
import type { LinkData } from "../../types/iitc/link.ts";
import type {
  PortalArtifactBrief,
  PortalArtifactBriefEntries,
  PortalArtifactDetail,
  PortalData,
  PortalHistory,
  PortalMod,
  PortalResonator,
} from "../../types/iitc/portal.ts";

interface ParsedEntities {
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

  if (data.length >= 5) portal.level = data[4] as PortalLevel;
  if (data.length >= 6) portal.health = data[5] as number;
  if (data.length >= 7) portal.resCount = data[6] as number;
  if (data.length >= 8) portal.image = data[7] as string;
  if (data.length >= 9) portal.title = data[8] as string;
  if (data.length >= 10 && Array.isArray(data[9])) portal.ornaments = data[9] as string[];

  if (data.length >= 13) {
    const artifactBrief = parseArtifactBrief(data[12]);
    if (artifactBrief) portal.artifactBrief = artifactBrief;
  }

  if (data.length >= 15) {
    const mods = parsePortalMods(data[14]);
    if (mods) portal.mods = mods;
  }

  if (data.length >= 16) {
    const resonators = parsePortalResonators(data[15]);
    if (resonators) portal.resonators = resonators;
  }

  if (data.length >= 17 && typeof data[16] === "string") portal.owner = data[16];

  if (data.length >= 18) {
    const artifactDetail = parseArtifactDetail(data[17]);
    if (artifactDetail) portal.artifactDetail = artifactDetail;
  }

  if (data.length >= 19) portal.history = parsePortalHistory(data[18]);

  return portal;
}

function parsePortalMods(value: unknown): (PortalMod | null)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(parsePortalMod);
}

function parsePortalMod(value: unknown): PortalMod | null {
  if (!Array.isArray(value)) return null;
  return {
    owner: value[0] as string,
    name: value[1] as string,
    rarity: value[2] as string,
    stats: value[3] as Record<string, string>,
  };
}

function parsePortalResonators(value: unknown): (PortalResonator | null)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(parsePortalResonator);
}

function parsePortalResonator(value: unknown): PortalResonator | null {
  if (!Array.isArray(value)) return null;
  return {
    owner: value[0] as string,
    level: value[1] as number,
    energy: value[2] as number,
  };
}

function parsePortalHistory(value: unknown): PortalHistory {
  const bitArray = typeof value === "number" ? value : 0;
  return {
    _raw: bitArray,
    visited: !!(bitArray & 1),
    captured: !!(bitArray & 2),
    scoutControlled: !!(bitArray & 4),
  };
}

function parseArtifactBrief(value: unknown): PortalArtifactBrief | undefined {
  if (!Array.isArray(value)) return undefined;

  return {
    fragment: parseArtifactBriefEntries(value[0]),
    target: parseArtifactBriefEntries(value[1]),
  };
}

function parseArtifactBriefEntries(value: unknown): PortalArtifactBriefEntries {
  const entries: PortalArtifactBriefEntries = {};
  if (!Array.isArray(value)) return entries;

  value.forEach((row) => {
    if (!Array.isArray(row) || typeof row[0] !== "string") return;
    entries[row[0]] = row.slice(1);
  });
  return entries;
}

function parseArtifactDetail(value: unknown): PortalArtifactDetail | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;

  const [type, displayName, fragments] = value;
  if (type === "" && displayName === "" && Array.isArray(fragments) && fragments.length === 0) return undefined;
  if (typeof type !== "string" || typeof displayName !== "string" || !Array.isArray(fragments)) return undefined;

  return {
    type,
    displayName,
    fragments: fragments.filter((fragment): fragment is number => typeof fragment === "number"),
  };
}

function parseLink(ent: RawEntity): LinkData {
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

function parseField(ent: RawEntity): FieldData {
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
