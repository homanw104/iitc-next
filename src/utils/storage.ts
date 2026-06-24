/**
 * A safe wrapper for localStorage that falls back to in-memory storage
 * if localStorage is inaccessible (e.g., due to SecurityError).
 * Bridges with Capacitor Preferences for persistence on mobile.
 */

import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { logManager } from "../managers/system/logManager";

const LOG_TAG = "Storage";

class SafeStorage implements Storage {
  private memoryStorage: Record<string, string> = {};
  private useLocalStorage: boolean = false;
  private initialized: boolean = false;
  private readonly isNative: boolean = false;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.checkAccessibility();
  }

  private checkAccessibility() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      this.useLocalStorage = true;

      // In non-native environment, populate memory cache from localStorage if available
      if (!this.isNative) {
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
      logManager.warn(LOG_TAG, "window.localStorage is NOT accessible. Using memory fallback.", e);
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
      const { keys } = await Preferences.keys();
      for (const key of keys) {
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          this.memoryStorage[key] = value;
          // If localStorage is available, sync it
          if (this.useLocalStorage) {
            try {
              window.localStorage.setItem(key, value);
            } catch {
              // Ignore sync errors
            }
          }
        }
      }
      this.initialized = true;
      logManager.debug(LOG_TAG, "Initialization complete.");
    } catch (e) {
      logManager.debug(LOG_TAG, "Failed to initialize Capacitor Preferences", e);
    }
  }

  get length(): number {
    return Object.keys(this.memoryStorage).length;
  }

  clear(): void {
    if (this.useLocalStorage) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore
      }
    }
    this.memoryStorage = {};
    if (this.isNative) {
      Preferences.clear().then();
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
    if (this.useLocalStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    delete this.memoryStorage[key];
    if (this.isNative) {
      Preferences.remove({ key }).then();
    }
  }

  setItem(key: string, value: string): void {
    if (this.useLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Ignore
      }
    }
    this.memoryStorage[key] = value;
    if (this.isNative) {
      Preferences.set({ key, value }).then();
    }
  }

  /**
   * Shadows window.localStorage with this instance.
   * Call this only if localStorage is inaccessible.
   */
  shadow() {
    if (this.useLocalStorage) return;
    try {
      Object.defineProperty(window, "localStorage", {
        value: this,
        configurable: true,
        enumerable: true,
        writable: true
      });
      logManager.debug(LOG_TAG, "window.localStorage shadowed by SafeStorage.");
    } catch (e) {
      logManager.error(LOG_TAG, "Failed to shadow window.localStorage", e);
    }
  }
}

export const safeLocalStorage = new SafeStorage();
