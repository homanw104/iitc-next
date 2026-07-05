/**
 * Portal entity layer id helpers.
 */

import type { PortalData } from "../../types/iitc/portal.ts";

export function getPortalEntityLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (isPortalPlaceholderLayer(data, level)) {
    return `portals-placeholder-${team}`;
  }
  return `portals-l${level}-${team}`;
}

export function getPortalLabelEntityLayerId(data: PortalData): string {
  const team = data.team.toLowerCase();
  const level = data.level ?? 0;
  if (isPortalPlaceholderLayer(data, level)) {
    return `portals-label-placeholder-${team}`;
  }
  return `portals-label-l${level}-${team}`;
}

export function getPortalOrnamentEntityLayerId(data: PortalData): string {
  return `portals-ornament-${data.team.toLowerCase()}`;
}

function isPortalPlaceholderLayer(data: PortalData, level: number): boolean {
  return data.isPlaceholder === true || level === 0;
}
