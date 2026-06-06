import { h } from "../../utils/dom";

const ButtonBar = ({ onShowPluginDetail }: {
  onShowPluginDetail: () => void,
}) => {
  return (
    <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <a
        id="plugins"
        style={{
          color: "#6088ff",
          cursor: "pointer",
        }}
        onClick={() => onShowPluginDetail()}
      >
        Plugins
      </a>
      <a
        id="signout"
        href="https://intel.ingress.com/logout"
        style={{
          color: "#6088ff",
        }}
      >
        Sign out
      </a>
    </div>
  );
};

export default ButtonBar;
