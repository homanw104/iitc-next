import { h } from "../../../utils/dom.ts";
import { pluginManager } from "../../../managers/pluginManager.ts";
import BackButton from "../../atoms/BackButton/BackButton.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const PluginDetailPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
  const plugins = pluginManager.getPlugins();

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
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Plugins</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {plugins.length === 0 && <div>No plugins registered.</div>}
        {plugins.map((plugin) => (
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
              <div style={{ fontWeight: "bold" }}>{plugin.name}</div>
              <div style={{ fontSize: "12px", color: "#aaa" }}>{plugin.description}</div>
            </div>
            <input
              type="checkbox"
              checked={pluginManager.isEnabled(plugin.id)}
              onClick={(e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                  pluginManager.enablePlugin(plugin.id);
                } else {
                  pluginManager.disablePlugin(plugin.id);
                }
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

export default PluginDetailPane;
