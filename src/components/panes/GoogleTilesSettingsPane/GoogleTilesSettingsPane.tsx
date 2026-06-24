import { settingsManager, type Google3dTilesRenderQuality } from "../../../managers/system/settingsManager.ts";
import { h } from "../../../utils/dom.ts";
import { safeWindow } from "../../../utils/window.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const GOOGLE_3D_TILES_RENDER_QUALITY_OPTIONS: {
  label: string;
  description: string;
  renderQuality: Google3dTilesRenderQuality;
}[] = [
  {
    label: "Performance",
    description: "Lower detail and memory use for smoother navigation.",
    renderQuality: "performance",
  },
  {
    label: "Balanced",
    description: "Default detail with moderate memory use.",
    renderQuality: "balanced",
  },
  {
    label: "High",
    description: "Sharper tiles with higher memory and GPU use.",
    renderQuality: "high",
  },
  {
    label: "Ultra",
    description: "Prioritizes fewer black cracks with the highest loading cost.",
    renderQuality: "ultra",
  },
];

const GoogleTilesSettingsPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
  const initialUseGoogle3dTiles = settingsManager.getUseGoogle3dTiles();
  const initialRenderQuality = settingsManager.getGoogle3dTilesRenderQuality();
  const initialDarkenGoogle3dTiles = settingsManager.getDarkenGoogle3dTiles();
  const optionInputs: HTMLInputElement[] = [];
  let reloadButton: HTMLAnchorElement | null = null;

  const updateReloadButtonVisibility = () => {
    if (!reloadButton) return;
    const useGoogle3dTilesChanged = settingsManager.getUseGoogle3dTiles() !== initialUseGoogle3dTiles;
    const renderQualityChanged = settingsManager.getGoogle3dTilesRenderQuality() !== initialRenderQuality;
    const darkenGoogle3dTilesChanged = settingsManager.getDarkenGoogle3dTiles() !== initialDarkenGoogle3dTiles;
    reloadButton.style.display = useGoogle3dTilesChanged || renderQualityChanged || darkenGoogle3dTilesChanged ? "inline" : "none";
  };

  const updateCheckedOptions = () => {
    const selectedRenderQuality = settingsManager.getGoogle3dTilesRenderQuality();
    optionInputs.forEach((input) => {
      input.checked = input.value === selectedRenderQuality;
    });
    updateReloadButtonVisibility();
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
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Google 3D Tiles</span>
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
          }}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>Use Google 3D Tiles</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Restart is required to take effect.</div>
          </div>
          <input
            type="checkbox"
            checked={initialUseGoogle3dTiles}
            onClick={(e: Event) => {
              const target = e.target as HTMLInputElement;
              settingsManager.setUseGoogle3dTiles(target.checked);
              updateReloadButtonVisibility();
            }}
            style={{
              width: "20px",
              height: "20px",
              cursor: "pointer",
            }}
          />
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
            <div style={{ fontWeight: "bold" }}>Darken Google 3D Tiles</div>
            <div style={{ fontSize: "12px", color: "#aaa" }}>Darker tiles make portals easier to see. Reload is required.</div>
          </div>
          <input
            type="checkbox"
            checked={initialDarkenGoogle3dTiles}
            onClick={(e: Event) => {
              const target = e.target as HTMLInputElement;
              settingsManager.setDarkenGoogle3dTiles(target.checked);
              updateReloadButtonVisibility();
            }}
            style={{
              width: "20px",
              height: "20px",
              cursor: "pointer",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
          <div style={{ fontWeight: "bold" }}>Render quality</div>
          {GOOGLE_3D_TILES_RENDER_QUALITY_OPTIONS.map((option) => (
            <div
              onClick={() => {
                settingsManager.setGoogle3dTilesRenderQuality(option.renderQuality);
                updateCheckedOptions();
              }}
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
                <div style={{ fontWeight: "bold" }}>{option.label}</div>
                <div style={{ fontSize: "12px", color: "#aaa" }}>{option.description}</div>
              </div>
              <input
                type="checkbox"
                value={option.renderQuality}
                checked={settingsManager.getGoogle3dTilesRenderQuality() === option.renderQuality}
                ref={(el: HTMLInputElement) => {
                  optionInputs.push(el);
                }}
                onClick={(e: Event) => {
                  e.stopPropagation();
                  settingsManager.setGoogle3dTilesRenderQuality(option.renderQuality);
                  updateCheckedOptions();
                }}
                style={{
                  width: "20px",
                  height: "20px",
                  cursor: "pointer",
                }}
              />
            </div>
          ))}
        </div>

        <a
          id="reload-google-3d-tiles"
          ref={(el: HTMLAnchorElement) => {
            reloadButton = el;
            updateReloadButtonVisibility();
          }}
          style={{
            alignSelf: "flex-end",
            color: "#6088ff",
            cursor: "pointer",
            display: "none",
            padding: "8px",
          }}
          onClick={() => safeWindow?.location.reload()}
        >
          Reload
        </a>
      </div>
    </div>
  ) as HTMLElement;
};

export default GoogleTilesSettingsPane;
