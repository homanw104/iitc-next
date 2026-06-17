import { safeLocalStorage } from "../utils/storage";
import { logManager } from "./logManager";

const SETTINGS_STORAGE_KEY = "iitc-settings";

export interface Settings {
  logging: {
    recordLogs: boolean;
  };
  refresh: {
    intervalMs: RefreshIntervalMs;
  };
}

export type RefreshIntervalMs = null | 10000 | 30000 | 60000 | 300000 | 600000 | 1800000;

const DEFAULT_SETTINGS: Settings = {
  logging: {
    recordLogs: false,
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
      const parsed = JSON.parse(stored) as Partial<Settings>;
      this.settings = {
        logging: {
          recordLogs: parsed.logging?.recordLogs ?? DEFAULT_SETTINGS.logging.recordLogs,
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
}

export const settingsManager = new SettingsManager();
