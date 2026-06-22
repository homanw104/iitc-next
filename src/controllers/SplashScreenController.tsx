import SplashScreen from "../components/splash/SplashScreen.tsx";
import type { LogEntryCallback } from "../managers/logManager";
import { logManager } from "../managers/logManager";

const FADE_OUT_MS = 400;

export class SplashScreenController {
  private splashEl: HTMLElement | null = null;
  private logEntryCallback: LogEntryCallback | null = null;

  constructor(
    private readonly container: HTMLElement,
  ) {}

  public init(): void {
    this.show();
    this.logEntryCallback = () => this.update();
    logManager.subscribe(this.logEntryCallback);
  }

  private show(): void {
    this.splashEl = this.container.appendChild(SplashScreen({
      logEntries: logManager.getRecordedLogs(),
      fadeOutMs: FADE_OUT_MS,
    }));
  }

  private close(): void {
    if (this.splashEl) {
      this.splashEl.remove();
      this.splashEl = null;
    }
  }

  private update(): void {
    this.close();
    this.show();
  }

  public deinit(): void {
    if (this.logEntryCallback) logManager.unsubscribe(this.logEntryCallback);
    this.logEntryCallback = null;

    if (this.splashEl) this.splashEl.style.opacity = "0";
    setTimeout(() => {
      if (this.splashEl) {
        this.splashEl.remove();
        this.splashEl = null;
      }
    }, FADE_OUT_MS);
  }
}
