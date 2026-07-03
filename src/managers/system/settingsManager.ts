/**
 * Settings Manager manages settings and has methods to load/save them.
 */

import { safeLocalStorage } from "../../utils/storage";
import { logManager } from "./logManager";

const LOG_TAG = "SettingsManager";
const SETTINGS_STORAGE_KEY = "iitc-next-settings";

export interface Settings {
  logging: {
    recordLogs: boolean;
  };
  cesium: {
    renderQuality: CesiumRenderQuality;
  };
  googleTiles: {
    useGoogle3dTiles: boolean;
    darkenGoogle3dTiles: boolean;
  };
  refresh: {
    intervalMs: RefreshIntervalMs;
  };
}

type StoredSettings = Partial<Settings>;

export type RefreshIntervalMs = null | 10000 | 30000 | 60000 | 300000 | 600000 | 1800000;
export type CesiumRenderQuality = "performance" | "balanced" | "high" | "ultra";

const DEFAULT_SETTINGS: Settings = {
  logging: {
    recordLogs: false,
  },
  cesium: {
    renderQuality: "balanced",
  },
  googleTiles: {
    useGoogle3dTiles: false,
    darkenGoogle3dTiles: false,
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

  public getCesiumRenderQuality(): CesiumRenderQuality {
    return this.settings.cesium.renderQuality;
  }

  public setCesiumRenderQuality(renderQuality: CesiumRenderQuality): void {
    this.settings.cesium.renderQuality = renderQuality;
    this.saveState();
  }

  public getUseGoogle3dTiles(): boolean {
    return this.settings.googleTiles.useGoogle3dTiles;
  }

  public setUseGoogle3dTiles(useGoogle3dTiles: boolean): void {
    this.settings.googleTiles.useGoogle3dTiles = useGoogle3dTiles;
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
      const parsed = JSON.parse(stored) as StoredSettings;
      this.settings = {
        logging: {
          recordLogs: parsed.logging?.recordLogs ?? DEFAULT_SETTINGS.logging.recordLogs,
        },
        cesium: {
          renderQuality: this.normalizeCesiumRenderQuality(parsed.cesium?.renderQuality),
        },
        googleTiles: {
          useGoogle3dTiles: parsed.googleTiles?.useGoogle3dTiles ?? DEFAULT_SETTINGS.googleTiles.useGoogle3dTiles,
          darkenGoogle3dTiles: parsed.googleTiles?.darkenGoogle3dTiles ?? DEFAULT_SETTINGS.googleTiles.darkenGoogle3dTiles,
        },
        refresh: {
          intervalMs: this.normalizeRefreshIntervalMs(parsed.refresh?.intervalMs),
        },
      };
      logManager.debug(LOG_TAG, "Loaded settings from storage.");
    } catch (e) {
      logManager.error(LOG_TAG, "Failed to load settings", e);
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

  private normalizeCesiumRenderQuality(renderQuality: unknown): CesiumRenderQuality {
    const allowedQualities: CesiumRenderQuality[] = ["performance", "balanced", "high", "ultra"];
    return allowedQualities.includes(renderQuality as CesiumRenderQuality)
      ? renderQuality as CesiumRenderQuality
      : DEFAULT_SETTINGS.cesium.renderQuality;
  }
}

export const settingsManager = new SettingsManager();
