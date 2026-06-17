import { h } from "../../../utils/dom.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import RightArrowIcon from "./RightArrowIcon.tsx";

const SettingsDetailPane = ({
  onBack,
  onClose,
  onShowRefreshIntervalDetail,
  onShowLoggingDetail,
  onShowPluginDetail,
}: {
  onBack: () => void,
  onClose: () => void,
  onShowRefreshIntervalDetail: () => void,
  onShowLoggingDetail: () => void,
  onShowPluginDetail: () => void,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: "5px",
        top: "calc(5px + 36px + 2px)",
        padding: "12px",
        margin: "2px 3px",
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px)",
        maxHeight: "80vh",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        zIndex: "10016",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Settings</span>
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
          onClick={() => onShowRefreshIntervalDetail()}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Refresh interval</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Choose how often the current view refreshes.</div>
          </div>
          <RightArrowIcon />
        </div>
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
          onClick={() => onShowLoggingDetail()}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Logging</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Record and export logs.</div>
          </div>
          <RightArrowIcon />
        </div>
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
          onClick={() => onShowPluginDetail()}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Plugins</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Manage installed plugins.</div>
          </div>
          <RightArrowIcon />
        </div>
      </div>
    </div>
  ) as HTMLElement;
};

export default SettingsDetailPane;
