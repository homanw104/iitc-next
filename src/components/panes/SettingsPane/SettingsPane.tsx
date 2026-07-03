import { h } from "../../../utils/dom.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import SettingsItem from "./SettingsItem.tsx";

const SettingsPane = ({
  onBack,
  onClose,
  onShowRenderQualityDetail,
  onShowGoogleTilesDetail,
  onShowRefreshIntervalDetail,
  onShowLoggingDetail,
  onShowPluginDetail,
}: {
  onBack: () => void,
  onClose: () => void,
  onShowRenderQualityDetail: () => void,
  onShowGoogleTilesDetail: () => void,
  onShowRefreshIntervalDetail: () => void,
  onShowLoggingDetail: () => void,
  onShowPluginDetail: () => void,
}) => (
    <div
      style={{
        position: "absolute",
        left: "var(--iitc-left-control-padding, 5px)",
        top: "calc(var(--iitc-top-control-padding, 5px) + 38px)",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-left-control-padding, 5px) - var(--iitc-right-control-padding, 5px) - 32px)",
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
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Settings</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <SettingsItem
          title="Render Quality"
          description="Control overall Cesium visual quality."
          onClick={() => onShowRenderQualityDetail()}
        />
        <SettingsItem
          title="Google 3D Tiles"
          description="Configure Google photorealistic terrain."
          onClick={() => onShowGoogleTilesDetail()}
        />
        <SettingsItem
          title="Refresh interval"
          description="Choose how often the current view refreshes."
          onClick={() => onShowRefreshIntervalDetail()}
        />
        <SettingsItem
          title="Logging"
          description="Record and export logs."
          onClick={() => onShowLoggingDetail()}
        />
        <SettingsItem
          title="Plugins"
          description="Manage installed plugins."
          onClick={() => onShowPluginDetail()}
        />
      </div>
    </div>
  ) as HTMLElement;

export default SettingsPane;
