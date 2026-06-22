import { h } from "../../utils/dom.ts";
import { LogEntry } from "../../managers/logManager.ts";
import SplashMessage from "./SplashMessage.tsx";

const SplashScreen = ({ logEntries, fadeOutMs }: {
  logEntries: LogEntry[];
  fadeOutMs: number;
}): HTMLElement => {
  return (
    <div
      id="iitc-next-startup-splash"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        padding: "min(8vw, 56px)",
        background: "#0b0c0c",
        fontFamily: "coda_regular, arial, helvetica, sans-serif",
        fontSize: "12px",
        lineHeight: 1.55,
        letterSpacing: 0,
        pointerEvents: "none",
        transition: `opacity ${fadeOutMs}ms ease`,
      }}
    >
      <div
        style={{
          fontSize: "48px",
          fontWeight: "700",
          fontFamily: "Open Sans, sans-serif",
          color: "#eeff77",
          marginBottom: "18px",
          flexShrink: 0,
        }}
      >
        IITC Next
      </div>
      <pre
        style={{
          margin: "0",
          padding: "0",
          minHeight: "70px",
          color: "#59fbea",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {"Initializing...\n\n"}
      </pre>
      <div
        style={{
          margin: "0",
          padding: "0",
          justifyContent: "flex-end",
          color: "#59fbea",
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, transparent, black 40px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 40px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: "40px" }} />
        {logEntries.map(logEntry => {
          return (
            <SplashMessage logEntry={logEntry} />
          );
        })}
      </div>
    </div>
  ) as HTMLElement;
};

export default SplashScreen;
