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

export class LogManager {
  private level: LogLevel = LogLevel.INFO;
  private latestMsg = "";
  private cb = (msg: string) => {};

  constructor() {
    // Default to INFO level
    this.level = LogLevel.INFO;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  setCallback(cb: (msg: string) => void) {
    this.cb = cb;
  }

  debug(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  info(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  warn(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }

  error(tag: string, ...args: unknown[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      this.cb(this.latestMsg);
    }
  }
}

export const logManager = new LogManager();
