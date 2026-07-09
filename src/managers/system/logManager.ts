/**
 * A simple log manager to toggle logging and manage log levels.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

export type LogEntryCallback = (entry: LogEntry) => void;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  args: string[];
}

export class LogManager {
  private level: LogLevel = "INFO";
  private isRecording = false;
  private recordedLogs: LogEntry[] = [];
  private entryCallbacks = new Set<LogEntryCallback>();

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public subscribe(callback: LogEntryCallback): void {
    this.entryCallbacks.add(callback);
  }

  public unsubscribe(callback: LogEntryCallback): void {
    this.entryCallbacks.delete(callback);
  }

  public setRecordingEnabled(isRecording: boolean): void {
    this.isRecording = isRecording;
  }

  public getRecordedLogs(): LogEntry[] {
    return this.recordedLogs;
  }

  public exportRecordedLogs(): string {
    return this.recordedLogs
      .map((entry) => `${entry.timestamp} [${entry.level}][${entry.tag}] ${entry.args.join(" ")}`)
      .join("\n");
  }

  public debug(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "DEBUG")) {
      console.log(`[DEBUG][${tag}]`, ...args);
      const entry = this.createEntry("DEBUG", tag, args);
      this.record(entry);
      this.emit(entry);
    }
  }

  public info(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "INFO")) {
      console.log(`[INFO][${tag}]`, ...args);
      const entry = this.createEntry("INFO", tag, args);
      this.record(entry);
      this.emit(entry);
    }
  }

  public warn(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "WARN")) {
      console.warn(`[WARN][${tag}]`, ...args);
      const entry = this.createEntry("WARN", tag, args);
      this.record(entry);
      this.emit(entry);
    }
  }

  public error(tag: string, ...args: unknown[]): void {
    if (this.isLevelLessThanOrEqual(this.level, "ERROR")) {
      console.error(`[ERROR][${tag}]`, ...args);
      const entry = this.createEntry("ERROR", tag, args);
      this.record(entry);
      this.emit(entry);
    }
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

  private createEntry(level: LogLevel, tag: string, args: unknown[]): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      tag,
      args: args.map((arg) => this.formatArg(arg)),
    };
  }

  private record(entry: LogEntry): void {
    if (!this.isRecording) return;
    this.recordedLogs.push(entry);
  }

  private emit(entry: LogEntry): void {
    this.entryCallbacks.forEach((callback) => callback(entry));
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
}

export const logManager = new LogManager();
