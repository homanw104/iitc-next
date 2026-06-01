/**
 * A simple log manager to toggle logging and manage log levels.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export class LogManager {
  private level: LogLevel = "INFO";
  private latestMsg = "Loaded";
  private cb = (_: string) => {};

  constructor() {
    this.level = "INFO";
  }

  private isLevelLessThanOrEqual(levelA: LogLevel, levelB: LogLevel): boolean {
    if (levelA === levelB) return true;
    if (levelA === "NONE") {
      return false;
    }
    if (levelA === "ERROR") {
      return levelB === "NONE";
    }
    if (levelA === "WARN") {
      return levelB === "ERROR" || levelB === "NONE";
    }
    if (levelA === "INFO") {
      return levelB === "WARN" || levelB === "ERROR" || levelB === "NONE";
    }
    return true; // DEBUG is only <= DEBUG
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setCallback(cb: (msg: string) => void): void {
    this.cb = cb;
  }

  debug(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "DEBUG")) {
      console.log(`[DEBUG][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  info(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "INFO")) {
      console.log(`[INFO][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  warn(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "WARN")) {
      console.warn(`[WARN][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  error(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "ERROR")) {
      console.error(`[ERROR][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }
}

export const logManager = new LogManager();
