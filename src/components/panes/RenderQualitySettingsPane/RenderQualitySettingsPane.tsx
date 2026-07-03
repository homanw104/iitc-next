import { settingsManager, type CesiumRenderQuality } from "../../../managers/system/settingsManager.ts";
import { h } from "../../../utils/dom.ts";
import { safeWindow } from "../../../utils/window.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const RENDER_QUALITY_OPTIONS: {
  label: string;
  description: string;
  renderQuality: CesiumRenderQuality;
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
    description: "Sharper terrain and 3D tiles with higher GPU use.",
    renderQuality: "high",
  },
  {
    label: "Ultra",
    description: "Maximum sharpness with the highest loading cost.",
    renderQuality: "ultra",
  },
];

const RenderQualitySettingsPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
  const initialRenderQuality = settingsManager.getCesiumRenderQuality();
  const optionInputs: HTMLInputElement[] = [];
  let reloadButton: HTMLAnchorElement | null = null;

  const updateReloadButtonVisibility = () => {
    if (!reloadButton) return;
    reloadButton.style.display = settingsManager.getCesiumRenderQuality() !== initialRenderQuality ? "inline" : "none";
  };

  const updateCheckedOptions = () => {
    const selectedRenderQuality = settingsManager.getCesiumRenderQuality();
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
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Render Quality</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {RENDER_QUALITY_OPTIONS.map((option) => (
          <div
            onClick={() => {
              settingsManager.setCesiumRenderQuality(option.renderQuality);
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
              checked={settingsManager.getCesiumRenderQuality() === option.renderQuality}
              ref={(el: HTMLInputElement) => {
                optionInputs.push(el);
              }}
              onClick={(e: Event) => {
                e.stopPropagation();
                settingsManager.setCesiumRenderQuality(option.renderQuality);
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

        <a
          id="reload-render-quality"
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

export default RenderQualitySettingsPane;
