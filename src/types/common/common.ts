export const PORTAL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type PortalLevel = typeof PORTAL_LEVELS[number];

export const TEAMS = ["ENLIGHTENED", "RESISTANCE", "MACHINA", "NEUTRAL"] as const;
export type Team = typeof TEAMS[number];

export const CHANNELS = ["all", "faction", "alerts"];
export type Channel = typeof CHANNELS[number];

export const RESO_LEVEL_ENERGY = [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
