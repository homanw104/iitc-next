export interface GetEntitiesPayload {
  tileKeys: string[];
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
        error?: string;
      };
    };
  };
}
