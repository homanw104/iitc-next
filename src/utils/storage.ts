/**
 * A safe wrapper for localStorage that falls back to in-memory storage
 * if localStorage is inaccessible (e.g., due to SecurityError).
 * Bridges with Capacitor Preferences for persistence on mobile.
 */

import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { logManager } from "../managers/logManager";

class SafeStorage implements Storage {
  private memoryStorage: Record<string, string> = {};
  private useLocalStorage: boolean = false;
  private initialized: boolean = false;
  private readonly isNative: boolean = false;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    logManager.debug("Storage", `Platform is native? ${this.isNative}`);
    this.checkAccessibility();
  }

  private checkAccessibility() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      this.useLocalStorage = true;
      logManager.debug("Storage", "window.localStorage is accessible.");

      // In non-native environment, populate memory cache from localStorage if available
      if (!this.isNative) {
        logManager.info("Storage", "Populating memory cache from localStorage (Web).");
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            const value = window.localStorage.getItem(key);
            if (value !== null) this.memoryStorage[key] = value;
          }
        }
      }
    } catch (e) {
      this.useLocalStorage = false;
      logManager.warn("Storage", "window.localStorage is NOT accessible. Using memory fallback.", e);
    }
  }

  /**
   * Initializes the storage by loading persistent data from Capacitor Preferences.
   * Only runs on native platforms.
   */
  async initialize() {
    if (this.initialized) return;
    if (!this.isNative) {
      this.initialized = true;
      return;
    }

    try {
      logManager.debug("Storage", "Loading from Capacitor Preferences...");
      const { keys } = await Preferences.keys();
      logManager.debug("Storage", `Found ${keys.length} keys in Preferences.`);

      for (const key of keys) {
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          logManager.debug("Storage", `Loaded key "${key}" = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
          this.memoryStorage[key] = value;
          // If localStorage is available, sync it
          if (this.useLocalStorage) {
            try {
              window.localStorage.setItem(key, value);
            } catch (e) {
              logManager.warn("Storage", `Failed to sync key "${key}" to localStorage`, e);
            }
          }
        }
      }
      this.initialized = true;
      logManager.debug("Storage", "Initialization complete.");
    } catch (e) {
      logManager.debug("Storage", "Failed to initialize Capacitor Preferences", e);
    }
  }

  get length(): number {
    return Object.keys(this.memoryStorage).length;
  }

  clear(): void {
    logManager.debug("Storage", "Clearing all storage.");
    if (this.useLocalStorage) {
      try {
        window.localStorage.clear();
      } catch (e) {
        logManager.debug("Storage", "Failed to clear localStorage", e);
      }
    }
    this.memoryStorage = {};
    if (this.isNative) {
      Preferences.clear().then(() => logManager.debug("Storage", "Preferences cleared."));
    }
  }

  getItem(key: string): string | null {
    return this.memoryStorage[key] || null;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.memoryStorage);
    return keys[index] || null;
  }

  removeItem(key: string): void {
    logManager.debug("Storage", `Removing key "${key}"`);
    if (this.useLocalStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        logManager.warn("Storage", `Failed to remove key "${key}" from localStorage`, e);
      }
    }
    delete this.memoryStorage[key];
    if (this.isNative) {
      Preferences.remove({ key }).then(() => logManager.debug("Storage", `Key "${key}" removed from Preferences.`));
    }
  }

  setItem(key: string, value: string): void {
    logManager.debug("Storage", `Setting key "${key}" = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
    if (this.useLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        logManager.warn("Storage", `Failed to set key "${key}" in localStorage`, e);
      }
    }
    this.memoryStorage[key] = value;
    if (this.isNative) {
      Preferences.set({ key, value }).then(() => {
        logManager.debug("Storage", `Key "${key}" persisted to Preferences.`);
      }).catch(e => {
        logManager.error("Storage", `Failed to persist key "${key}" to Preferences`, e);
      });
    }
  }

  /**
   * Shadows window.localStorage with this instance.
   * Call this only if localStorage is inaccessible.
   */
  shadow() {
    if (this.useLocalStorage) {
      logManager.debug("Storage", "Skipping shadow as localStorage is available.");
      return;
    }
    try {
      Object.defineProperty(window, "localStorage", {
        value: this,
        configurable: true,
        enumerable: true,
        writable: true
      });
      logManager.debug("Storage", "window.localStorage shadowed by SafeStorage.");
    } catch (e) {
      logManager.error("Storage", "Failed to shadow window.localStorage", e);
    }
  }
}

export const safeLocalStorage = new SafeStorage();
