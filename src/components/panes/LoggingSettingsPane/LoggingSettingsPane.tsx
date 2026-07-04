import { logManager } from "../../../managers/system/logManager.ts";
import { settingsManager } from "../../../managers/system/settingsManager.ts";
import { h } from "../../../utils/dom.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import RightArrowIcon from "../SettingsPane/RightArrowIcon.tsx";

const exportLogs = () => {
  const logs = logManager.exportRecordedLogs();
  const filename = `iitc-next-logs-${new Date().toISOString().replace(/:/g, "-")}.txt`;
  const mimeType = "text/plain";

  // Support for Android Wrapper
  // @ts-expect-error support for Android wrapper
  if (window.IITC_Native && window.IITC_Native.saveFile) {
    // @ts-expect-error support for Android wrapper
    window.IITC_Native.saveFile(logs, filename, mimeType);
    return;
  }

  const blob = new Blob([logs], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const LoggingSettingsPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
  const updateStatus = (el: HTMLElement | null) => {
    if (!el) return;
    el.textContent = settingsManager.getLogRecordingEnabled() ? "Recording enabled" : "Recording disabled";
  };
  let statusEl: HTMLElement | null = null;

  return (
    <div
      style={{
        position: "absolute",
        left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
        top: "calc(var(--iitc-system-top-inset, 0px) + 43px)",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 42px)",
        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding - 2 * button - 2 * margin compensate
        maxHeight: "calc(100% - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 116px)",

        display: "flex",
        flexDirection: "column",
        gap: "10px",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        overflowY: "auto",
        zIndex: "10016",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Logging</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Record logs</div>
            <div
              ref={(el: HTMLElement) => {
                statusEl = el;
                updateStatus(statusEl);
              }}
              style={{ fontSize: "12px", color: "#aaa" }}
            />
          </div>
          <input
            type="checkbox"
            checked={settingsManager.getLogRecordingEnabled()}
            onClick={(e: Event) => {
              const target = e.target as HTMLInputElement;
              settingsManager.setLogRecordingEnabled(target.checked);
              updateStatus(statusEl);
            }}
            style={{
              width: "20px",
              height: "20px",
              cursor: "pointer",
            }}
          />
        </div>

        <div
          onClick={() => exportLogs()}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Export logs</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Download recorded logs.</div>
          </div>
          <RightArrowIcon />
        </div>
      </div>
    </div>
  ) as HTMLElement;
};

export default LoggingSettingsPane;
