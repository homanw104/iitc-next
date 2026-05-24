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
      console.debug(`[${tag}]`, ...args);
    }
  }

  info(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[${tag}]`, ...args);
    }
  }

  warn(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[${tag}]`, ...args);
    }
  }

  error(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${tag}]`, ...args);
    }
  }
}

export const logger = new LogManager();
