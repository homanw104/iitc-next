import type { PortalLevel, Team } from "../common/common.ts";
import type { FieldData } from "./field.ts";
import type { LinkData } from "./link.ts";

export interface PortalData {
  guid: string;
  team: Team;
  latE6: number;
  lngE6: number;
  level?: PortalLevel;
  health?: number;
  resCount?: number;
  image?: string;
  title?: string;
  ornaments?: string[];
  artifactBrief?: PortalArtifactBrief;
  artifactDetail?: PortalArtifactDetail;
  timestamp?: number;
  isPlaceholder?: boolean;
  mods?: (PortalMod | null)[];
  resonators?: (PortalResonator | null)[];
  owner?: string;
  history?: PortalHistory;
  links?: LinkData[];
  fields?: FieldData[];
}

export type PortalArtifactBriefEntries = Record<string, unknown[]>;

export interface PortalArtifactBrief {
  fragment: PortalArtifactBriefEntries;
  target: PortalArtifactBriefEntries;
}

export interface PortalArtifactDetail {
  type: string;
  displayName: string;
  fragments: number[];
}

export interface PortalMod {
  owner: string;
  name: string;
  rarity: string;
  stats: Record<string, string>;
}

export interface PortalResonator {
  owner: string;
  level: number;
  energy: number;
}

export interface PortalHistory {
  _raw: number;
  visited: boolean;
  captured: boolean;
  scoutControlled: boolean;
}
