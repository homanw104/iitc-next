import { h } from "../../../utils/dom.ts";
import { settingsManager } from "../../../managers/settingsManager.ts";
import { safeWindow } from "../../../utils/window.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import RightArrowIcon from "./RightArrowIcon.tsx";

const SettingsPane = ({
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
  const initialUseGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  let reloadButton: HTMLAnchorElement | null = null;

  const updateReloadButtonVisibility = (useGoogle3dTiles: boolean) => {
    if (!reloadButton) return;
    reloadButton.style.display = useGoogle3dTiles === initialUseGoogle3dTiles ? "none" : "inline";
  };

  return (
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderRadius: "4px",
        }}
      >
        <div>
          <div style={{ fontWeight: "bold" }}>Use Google 3D Tiles</div>
          <div style={{ fontSize: "12px", color: "#aaa" }}>Restart is required to take effect.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            id="reload-google-3d-tiles"
            ref={(el: HTMLAnchorElement) => {
              reloadButton = el;
              updateReloadButtonVisibility(settingsManager.getUseGoogle3dTiles());
            }}
            style={{
              color: "#6088ff",
              cursor: "pointer",
              display: "none",
            }}
            onClick={() => safeWindow?.location.reload()}
          >
            Reload
          </a>
          <input
            type="checkbox"
            checked={initialUseGoogle3dTiles}
            onClick={(e: Event) => {
              const target = e.target as HTMLInputElement;
              settingsManager.setUseGoogle3dTiles(target.checked);
              updateReloadButtonVisibility(target.checked);
            }}
            style={{
              width: "20px",
              height: "20px",
              cursor: "pointer",
            }}
          />
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

export default SettingsPane;
