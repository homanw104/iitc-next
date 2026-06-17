/**
 * A simple log manager to toggle logging and manage log levels.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export type LoggingCallback = (msg: string) => void;

export interface LogEntry {
  timestamp: string;
  level: Exclude<LogLevel, "NONE">;
  tag: string;
  args: string[];
}

export class LogManager {
  private level: LogLevel = "INFO";
  private latestMsg = "Loaded";

  private cb: LoggingCallback | null = null;
  private isRecording = false;
  private recordedLogs: LogEntry[] = [];

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

  setRecordingEnabled(isRecording: boolean): void {
    this.isRecording = isRecording;
  }

  exportRecordedLogs(): string {
    return this.recordedLogs
      .map((entry) => `${entry.timestamp} [${entry.level}][${entry.tag}] ${entry.args.join(" ")}`)
      .join("\n");
  }

  private formatArg(arg: unknown): string {
    if (arg instanceof Error) {
      return arg.stack || arg.message;
    }
    if (typeof arg === "string") {
      return arg;
    }
    if (typeof arg === "number" || typeof arg === "boolean" || arg === null || arg === undefined) {
      return String(arg);
    }
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  private record(level: Exclude<LogLevel, "NONE">, tag: string, args: unknown[]): void {
    if (!this.isRecording) return;

    this.recordedLogs.push({
      timestamp: new Date().toISOString(),
      level,
      tag,
      args: args.map((arg) => this.formatArg(arg)),
    });
  }

  debug(tag: string, ...args: unknown[]): void {
    this.record("DEBUG", tag, args);
    if (this.isLevelLessThanOrEqual(this.level, "DEBUG")) {
      console.log(`[DEBUG][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      if (this.cb) this.cb(this.latestMsg);
    }
  }

  info(tag: string, ...args: unknown[]): void {
    this.record("INFO", tag, args);
    if (this.isLevelLessThanOrEqual(this.level, "INFO")) {
      console.log(`[INFO][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      if (this.cb) this.cb(this.latestMsg);
    }
  }

  warn(tag: string, ...args: unknown[]): void {
    this.record("WARN", tag, args);
    if (this.isLevelLessThanOrEqual(this.level, "WARN")) {
      console.warn(`[WARN][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      if (this.cb) this.cb(this.latestMsg);
    }
  }

  error(tag: string, ...args: unknown[]): void {
    this.record("ERROR", tag, args);
    if (this.isLevelLessThanOrEqual(this.level, "ERROR")) {
      console.error(`[ERROR][${tag}]`, ...args);
      this.latestMsg = args[0] as string;
      if (this.cb) this.cb(this.latestMsg);
    }
  }
}

export const logManager = new LogManager();
