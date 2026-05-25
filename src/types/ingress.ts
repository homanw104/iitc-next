/**
 * Type definitions for Ingress entities.
 */

export type Team = "ENLIGHTENED" | "RESISTANCE" | "MACHINA" | "NEUTRAL";

export interface PortalData {
  guid: string;
  team: Team;
  latE6: number;
  lngE6: number;
  level?: number;
  health?: number;
  resCount?: number;
  image?: string;
  title?: string;
  timestamp: number;
  placeholder?: boolean;
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
