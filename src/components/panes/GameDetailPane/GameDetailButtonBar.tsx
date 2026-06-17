import { h } from "../../../utils/dom.ts";

const GameDetailButtonBar = ({ onShowPluginDetail, onShowAboutDetail }: {
  onShowPluginDetail: () => void,
  onShowAboutDetail: () => void,
}) => {
  return (
    <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ display: "flex", gap: "12px" }}>
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
          id="about"
          style={{
            color: "#6088ff",
            cursor: "pointer",
          }}
          onClick={() => onShowAboutDetail()}
        >
          About
        </a>
      </div>
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

export default GameDetailButtonBar;
