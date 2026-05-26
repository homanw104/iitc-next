/**
 * Type definitions for Ingress entities.
 */

export const PORTAL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type PortalLevel = typeof PORTAL_LEVELS[number];

export const TEAMS = [
  "ENLIGHTENED",
  "RESISTANCE",
  "MACHINA",
  "NEUTRAL",
] as const;

export type Team = typeof TEAMS[number];

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
  timestamp: number;
  placeholder?: boolean;
  mods?: (PortalMod | null)[];
  resonators?: (PortalResonator | null)[];
  owner?: string;
  history?: PortalHistory;
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

export interface LinkData {
  guid: string;
  team: Team;
  oGuid: string;
  oLatE6: number;
  oLngE6: number;
  dGuid: string;
  dLatE6: number;
  dLngE6: number;
  timestamp: number;
}

export interface FieldData {
  guid: string;
  team: Team;
  points: {
    guid: string;
    latE6: number;
    lngE6: number;
  }[];
  timestamp: number;
}

export type RawEntity = [
  string,   // GUID
  number,   // Timestamp
  unknown[] // Data array
];

export interface TileResponse {
  result: {
    map: {
      [tileId: string]: {
        gameEntities?: RawEntity[];
        deletedGameEntityGuids?: string[];
        error?: string;
      };
    };
  };
}
