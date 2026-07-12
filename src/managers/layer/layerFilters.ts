/**
 * Defines layer filter state and maps filters to render layer visibility.
 */

import { PORTAL_LEVELS, TEAMS } from "../../types/common/common.ts";

export const FILTER_STATES_STORAGE_KEY = "iitc-next-filter-states";
export const PORTAL_GROUP_FILTER = "portals";
export const PORTAL_CHILD_FILTERS = [
  "portals-placeholder",
  "portals-label",
  "portals-ornament",
];
export const MUTUALLY_EXCLUSIVE_HISTORY_FILTERS = [
  "history",
  "history-reverse",
  "scout-control",
  "scout-control-reverse",
];

type LayerVisibilitySetter = (name: string, visible: boolean) => void;

const DEFAULT_FILTER_ENTRIES: Array<[string, boolean]> = createDefaultFilterEntries();
const BUILT_IN_DATA_SOURCE_AND_OVERLAY_NAMES = createBuiltInDataSourceAndOverlayNames();

const BUILT_IN_FILTER_NAMES = new Set(DEFAULT_FILTER_ENTRIES.map(([name]) => name));
const BUILT_IN_DATA_SOURCE_AND_OVERLAY_NAME_SET = new Set(BUILT_IN_DATA_SOURCE_AND_OVERLAY_NAMES);

export function createDefaultFilterState(): Map<string, boolean> {
  return new Map(DEFAULT_FILTER_ENTRIES);
}

export function isBuiltInFilter(name: string): boolean {
  return BUILT_IN_FILTER_NAMES.has(name);
}

export function isBuiltInDataSourceOrOverlay(name: string): boolean {
  return BUILT_IN_DATA_SOURCE_AND_OVERLAY_NAME_SET.has(name);
}

export function setPortalChildFilters(filterState: Map<string, boolean>, enabled: boolean): void {
  PORTAL_LEVELS.forEach(l => filterState.set(`level-${l}`, enabled));
  PORTAL_CHILD_FILTERS.forEach(filter => filterState.set(filter, enabled));
}

export function getPortalChildFilterStates(filterState: Map<string, boolean>): boolean[] {
  return [
    ...PORTAL_LEVELS.map(l => filterState.get(`level-${l}`) !== false),
    ...PORTAL_CHILD_FILTERS.map(filter => filterState.get(filter) !== false),
  ];
}

export function normalizeMutuallyExclusiveFilters(filterState: Map<string, boolean>): void {
  let enabledFilter: string | null = null;

  MUTUALLY_EXCLUSIVE_HISTORY_FILTERS.forEach(filter => {
    if (filterState.get(filter) !== true) return;

    // Enable the first previously enabled filter only.
    if (enabledFilter) {
      filterState.set(filter, false);
    } else {
      enabledFilter = filter;
    }
  });
}

export function applyLayerFilters(
  filterState: Map<string, boolean>,
  pluginFilterNames: Iterable<string>,
  setLayerVisibility: LayerVisibilitySetter,
): void {
  TEAMS.map(t => t.toLowerCase()).forEach(team => {
    const teamVisible = isEnabled(filterState, `team-${team}`);
    const labelsVisible = teamVisible && isEnabled(filterState, "portals-label");

    PORTAL_LEVELS.forEach(level => {
      setLayerVisibility(
        `portals-l${level}-${team}`,
        teamVisible && isEnabled(filterState, `level-${level}`),
      );
      setLayerVisibility(
        `portals-label-l${level}-${team}`,
        labelsVisible && isEnabled(filterState, `level-${level}`),
      );
    });

    setLayerVisibility(
      `portals-label-placeholder-${team}`,
      labelsVisible && isEnabled(filterState, "portals-placeholder"),
    );
    setLayerVisibility(`portals-ornament-${team}`, teamVisible && isEnabled(filterState, "portals-ornament"));
    setLayerVisibility(`portals-placeholder-${team}`, teamVisible && isEnabled(filterState, "portals-placeholder"));
    setLayerVisibility(`links-${team}`, teamVisible && isEnabled(filterState, "links"));
    setLayerVisibility(`fields-${team}`, teamVisible && isEnabled(filterState, "fields"));
  });

  setLayerVisibility("history-visited-captured", isEnabled(filterState, "history"));
  setLayerVisibility("history-visited-captured-reverse", isEnabled(filterState, "history-reverse"));
  setLayerVisibility("history-scout-control", isEnabled(filterState, "scout-control"));
  setLayerVisibility("history-scout-control-reverse", isEnabled(filterState, "scout-control-reverse"));
  setLayerVisibility("user-location", isEnabled(filterState, "user-location"));
  setLayerVisibility("user-location-range", isEnabled(filterState, "user-location-range"));
  setLayerVisibility("debug-tiles", isEnabled(filterState, "debug-tiles"));

  for (const filter of pluginFilterNames) {
    setLayerVisibility(filter, isEnabled(filterState, filter));
  }
}

function createDefaultFilterEntries(): Array<[string, boolean]> {
  const filterEntries: Array<[string, boolean]> = [];

  TEAMS.forEach(t => filterEntries.push([`team-${t.toLowerCase()}`, true]));
  PORTAL_LEVELS.forEach(l => filterEntries.push([`level-${l}`, true]));
  PORTAL_CHILD_FILTERS.forEach(filter => filterEntries.push([filter, true]));
  filterEntries.push(
    [PORTAL_GROUP_FILTER, true],
    ["links", true],
    ["fields", true],
    ["history", false],
    ["scout-control", false],
    ["history-reverse", false],
    ["scout-control-reverse", false],
    ["user-location", false],
    ["user-location-range", false],
    ["debug-tiles", false],
  );

  return filterEntries;
}

function createBuiltInDataSourceAndOverlayNames(): string[] {
  const names = [
    "history-visited-captured",
    "history-visited-captured-reverse",
    "history-scout-control",
    "history-scout-control-reverse",
    "user-location",
    "user-location-range",
    "debug-tiles",
  ];

  TEAMS.forEach(t => {
    const team = t.toLowerCase();

    PORTAL_LEVELS.forEach(l => {
      names.push(`portals-l${l}-${team}`);
      names.push(`portals-label-l${l}-${team}`);
    });
    names.push(`portals-placeholder-${team}`);
    names.push(`portals-label-placeholder-${team}`);
    names.push(`portals-ornament-${team}`);
    names.push(`links-${team}`);
    names.push(`fields-${team}`);
  });

  return names;
}

function isEnabled(filterState: Map<string, boolean>, name: string): boolean {
  return filterState.get(name) !== false;
}
