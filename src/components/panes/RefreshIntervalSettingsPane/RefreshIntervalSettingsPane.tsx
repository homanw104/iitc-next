import { h } from "../../../utils/dom.ts";
import type { RefreshIntervalMs } from "../../../managers/system/settingsManager.ts";
import type { TileRequestManager } from "../../../managers/tiles/tileRequestManager.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const REFRESH_INTERVAL_OPTIONS: { label: string; intervalMs: RefreshIntervalMs }[] = [
  { label: "Manual", intervalMs: null },
  { label: "10 seconds", intervalMs: 10000 },
  { label: "30 seconds", intervalMs: 30000 },
  { label: "1 minute", intervalMs: 60000 },
  { label: "5 minutes", intervalMs: 300000 },
  { label: "10 minutes", intervalMs: 600000 },
  { label: "30 minutes", intervalMs: 1800000 },
];

const RefreshIntervalSettingsPane = ({ tileRequestManager, onBack, onClose }: {
  tileRequestManager: TileRequestManager,
  onBack: () => void,
  onClose: () => void,
}) => {
  const optionInputs: HTMLInputElement[] = [];

  const updateCheckedOptions = () => {
    const selectedIntervalMs = tileRequestManager.getRefreshIntervalMs();
    optionInputs.forEach((input) => {
      input.checked = input.value === String(selectedIntervalMs);
    });
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
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Refresh Interval</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {REFRESH_INTERVAL_OPTIONS.map((option) => (
          <div
            onClick={() => {
              tileRequestManager.setRefreshIntervalMs(option.intervalMs);
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
            <div style={{ fontWeight: "bold" }}>{option.label}</div>
            <input
              type="checkbox"
              value={String(option.intervalMs)}
              checked={tileRequestManager.getRefreshIntervalMs() === option.intervalMs}
              ref={(el: HTMLInputElement) => {
                optionInputs.push(el);
              }}
              onClick={(e: Event) => {
                e.stopPropagation();
                tileRequestManager.setRefreshIntervalMs(option.intervalMs);
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
    </div>
  ) as HTMLElement;
};

export default RefreshIntervalSettingsPane;
