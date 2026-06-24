import SplashMessage from "../components/splash/SplashMessage.tsx";
import SplashScreen from "../components/splash/SplashScreen.tsx";
import type { LogEntry, LogEntryCallback } from "../managers/system/logManager";
import { logManager } from "../managers/system/logManager";

const FADE_OUT_MS = 200;

export class SplashScreenController {
  private splashEl: HTMLElement | null = null;
  private logGridEl: HTMLElement | null = null;
  private logEntryCallback: LogEntryCallback | null = null;

  constructor(
    private readonly container: HTMLElement,
  ) {}

  public init(): void {
    this.splashEl = this.container.appendChild(SplashScreen({
      logEntries: logManager.getRecordedLogs(),
      fadeOutMs: FADE_OUT_MS,
      onLogGridRef: (logGrid) => {
        this.logGridEl = logGrid;
        this.scheduleClippedMessageUpdate(logGrid);
      },
    }));
    this.logEntryCallback = (entry) => this.appendLogEntry(entry);
    logManager.subscribe(this.logEntryCallback);
  }

  private appendLogEntry(entry: LogEntry): void {
    if (!logManager.getRecordedLogs().includes(entry)) return;
    if (!this.logGridEl) return;

    this.logGridEl.appendChild(SplashMessage({ logEntry: entry }));
    this.scheduleClippedMessageUpdate(this.logGridEl);
  }

  private scheduleClippedMessageUpdate = (logGrid: HTMLElement): void => {
    requestAnimationFrame(() => {
      const viewport = logGrid.parentElement;
      if (!viewport || !logGrid.isConnected) return;

      const viewportRect = viewport.getBoundingClientRect();
      const contentRect = logGrid.getBoundingClientRect();

      logGrid.style.alignSelf = contentRect.height <= viewportRect.height
        ? "start"
        : "end";

      for (const message of Array.from(logGrid.children)) {
        if (!(message instanceof HTMLElement)) continue;

        const messageRect = message.getBoundingClientRect();
        const isFullyVisible = messageRect.top >= viewportRect.top
          && messageRect.bottom <= viewportRect.bottom;

        message.style.visibility = isFullyVisible ? "visible" : "hidden";
      }
    });
  };

  public deinit(): void {
    if (this.logEntryCallback) logManager.unsubscribe(this.logEntryCallback);
    this.logEntryCallback = null;

    if (this.splashEl) this.splashEl.style.opacity = "0";
    setTimeout(() => {
      if (this.splashEl) {
        this.splashEl.remove();
        this.splashEl = null;
        this.logGridEl = null;
      }
    }, FADE_OUT_MS);
  }
}
