/**
 * Settings Manager manages settings and has methods to load/save them.
 */

import { safeLocalStorage } from "../utils/storage";
import { logManager } from "./logManager";

const SETTINGS_STORAGE_KEY = "iitc-settings";

export interface Settings {
  logging: {
    recordLogs: boolean;
  };
  googleTiles: {
    useGoogle3dTiles: boolean;
    darkenGoogle3dTiles: boolean;
    google3dTilesRenderQuality: Google3dTilesRenderQuality;
  };
  refresh: {
    intervalMs: RefreshIntervalMs;
  };
}

type LegacySettings = Partial<Settings> & {
  map?: Partial<Settings["googleTiles"]>;
};

export type RefreshIntervalMs = null | 10000 | 30000 | 60000 | 300000 | 600000 | 1800000;
export type Google3dTilesRenderQuality = "performance" | "balanced" | "high" | "ultra";

const DEFAULT_SETTINGS: Settings = {
  logging: {
    recordLogs: false,
  },
  googleTiles: {
    useGoogle3dTiles: false,
    darkenGoogle3dTiles: false,
    google3dTilesRenderQuality: "balanced",
  },
  refresh: {
    intervalMs: null,
  },
};

export class SettingsManager {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);
  private initialized = false;

  public initialize(): void {
    if (this.initialized) return;

    this.loadState();
    this.applySettings();
    this.initialized = true;
  }

  public getLogRecordingEnabled(): boolean {
    return this.settings.logging.recordLogs;
  }

  public setLogRecordingEnabled(recordLogs: boolean): void {
    this.settings.logging.recordLogs = recordLogs;
    logManager.setRecordingEnabled(recordLogs);
    this.saveState();
  }

  public getUseGoogle3dTiles(): boolean {
    return this.settings.googleTiles.useGoogle3dTiles;
  }

  public setUseGoogle3dTiles(useGoogle3dTiles: boolean): void {
    this.settings.googleTiles.useGoogle3dTiles = useGoogle3dTiles;
    this.saveState();
  }

  public getGoogle3dTilesRenderQuality(): Google3dTilesRenderQuality {
    return this.settings.googleTiles.google3dTilesRenderQuality;
  }

  public setGoogle3dTilesRenderQuality(renderQuality: Google3dTilesRenderQuality): void {
    this.settings.googleTiles.google3dTilesRenderQuality = renderQuality;
    this.saveState();
  }

  public getDarkenGoogle3dTiles(): boolean {
    return this.settings.googleTiles.darkenGoogle3dTiles;
  }

  public setDarkenGoogle3dTiles(darkenGoogle3dTiles: boolean): void {
    this.settings.googleTiles.darkenGoogle3dTiles = darkenGoogle3dTiles;
    this.saveState();
  }

  public getRefreshIntervalMs(): RefreshIntervalMs {
    return this.settings.refresh.intervalMs;
  }

  public setRefreshIntervalMs(intervalMs: RefreshIntervalMs): void {
    this.settings.refresh.intervalMs = intervalMs;
    this.saveState();
  }

  private loadState(): void {
    const stored = safeLocalStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as LegacySettings;
      const googleTiles = parsed.googleTiles ?? parsed.map;
      this.settings = {
        logging: {
          recordLogs: parsed.logging?.recordLogs ?? DEFAULT_SETTINGS.logging.recordLogs,
        },
        googleTiles: {
          useGoogle3dTiles: googleTiles?.useGoogle3dTiles ?? DEFAULT_SETTINGS.googleTiles.useGoogle3dTiles,
          google3dTilesRenderQuality: this.normalizeGoogle3dTilesRenderQuality(googleTiles?.google3dTilesRenderQuality),
          darkenGoogle3dTiles: googleTiles?.darkenGoogle3dTiles ?? DEFAULT_SETTINGS.googleTiles.darkenGoogle3dTiles,
        },
        refresh: {
          intervalMs: this.normalizeRefreshIntervalMs(parsed.refresh?.intervalMs),
        },
      };
      logManager.debug("SettingsManager", "Loaded settings from storage.");
    } catch (e) {
      logManager.error("SettingsManager", "Failed to load settings", e);
      this.removeState();
    }
  }

  private saveState(): void {
    safeLocalStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
  }

  private removeState(): void {
    safeLocalStorage.removeItem(SETTINGS_STORAGE_KEY);
  }

  private applySettings(): void {
    logManager.setRecordingEnabled(this.settings.logging.recordLogs);
  }

  private normalizeRefreshIntervalMs(intervalMs: unknown): RefreshIntervalMs {
    const allowedIntervals: RefreshIntervalMs[] = [null, 10000, 30000, 60000, 300000, 600000, 1800000];
    return allowedIntervals.includes(intervalMs as RefreshIntervalMs)
      ? intervalMs as RefreshIntervalMs
      : DEFAULT_SETTINGS.refresh.intervalMs;
  }

  private normalizeGoogle3dTilesRenderQuality(renderQuality: unknown): Google3dTilesRenderQuality {
    const allowedQualities: Google3dTilesRenderQuality[] = ["performance", "balanced", "high", "ultra"];
    return allowedQualities.includes(renderQuality as Google3dTilesRenderQuality)
      ? renderQuality as Google3dTilesRenderQuality
      : DEFAULT_SETTINGS.googleTiles.google3dTilesRenderQuality;
  }
}

export const settingsManager = new SettingsManager();
