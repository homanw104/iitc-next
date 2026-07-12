/**
 * Types shared by field coverage preprocessing and rendering.
 */

export type FieldCoveragePosition = [number, number];
// polygon-clipping returns self-closing rings; the final point repeats the first.
export type FieldCoverageRing = FieldCoveragePosition[];
export type FieldCoveragePolygon = FieldCoverageRing[];
export type FieldCoverageMultiPolygon = FieldCoveragePolygon[];

export interface FieldCoverageInput {
  guid: string;
  points: Array<{
    latE6: number;
    lngE6: number;
  }>;
}

export interface FieldCoverageLayerInput {
  layerId: string;
  fields: FieldCoverageInput[];
}

export interface FieldCoverageLayerResult {
  layerId: string;
  coverageByDepth: FieldCoverageMultiPolygon[];
}

export type FieldCoverageResponse = {
  generation: number;
  layers: FieldCoverageLayerResult[];
} | {
  generation: number;
  error: string;
};
