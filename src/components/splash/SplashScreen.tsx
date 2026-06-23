import { h } from "../../utils/dom.ts";
import { LogEntry } from "../../managers/logManager.ts";
import SplashMessage from "./SplashMessage.tsx";
import SplashTitle from "./SplashTitle.tsx";
import SplashInitText from "./SplashInitText.tsx";
import SplashDivider from "./SplashDivider.tsx";

const scheduleClippedMessageUpdate = (logGrid: HTMLElement): void => {
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

const SplashScreen = ({ logEntries, fadeOutMs }: {
  logEntries: LogEntry[];
  fadeOutMs: number;
}): HTMLElement => {
  return (
    <div
      id="iitc-next-startup-splash"
      style={{
        position: "fixed",
        inset: "0px",
        padding: "0px",
        zIndex: 2147483647,
        background: "#0b0c0c",
        fontFamily: "coda_regular, arial, helvetica, sans-serif",
        fontSize: "12px",
        lineHeight: 1.55,
        letterSpacing: 0,
        pointerEvents: "auto",
        transition: `opacity ${fadeOutMs}ms ease`,
      }}
    >
      <div
        id="iitc-next-startup-splash-container"
        style={{
          position: "absolute",
          left: "calc(var(--iitc-left-control-padding, 0px) + 20px)",
          right: "calc(var(--iitc-right-control-padding, 0px) + 20px)",
          top: "calc(var(--iitc-top-control-padding, 0px) + 65px)",
          bottom: "calc(var(--iitc-bottom-control-padding, 0px) + 65px)",
          border: "1px solid #499399",
          padding: "40px",
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr)",
          overflow: "hidden",
        }}
      >
        <SplashTitle />
        <SplashDivider />
        <SplashInitText />
        <div
          style={{
            margin: "0",
            padding: "0",
            minHeight: "0",
            color: "#59fbea",
            overflow: "hidden",
            display: "grid",
            gridTemplateRows: "minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          <div
            ref={scheduleClippedMessageUpdate}
            style={{
              width: "100%",
            }}
          >
            {logEntries.map(logEntry => {
              return (
                <SplashMessage logEntry={logEntry} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  ) as HTMLElement;
};

export default SplashScreen;
