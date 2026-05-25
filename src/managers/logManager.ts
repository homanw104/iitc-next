/**
 * A simple log manager to toggle logging and manage log levels.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class LogManager {
  private level: LogLevel = LogLevel.INFO;

  constructor() {
    // Default to INFO level
    this.level = LogLevel.INFO;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG][${tag}]`, ...args);
    }
  }

  info(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO][${tag}]`, ...args);
    }
  }

  warn(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN][${tag}]`, ...args);
    }
  }

  error(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR][${tag}]`, ...args);
    }
  }
}

export const logManager = new LogManager();
