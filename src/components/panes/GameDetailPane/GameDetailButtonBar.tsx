import { h } from "../../../utils/dom.ts";

const GameDetailButtonBar = ({ onShowSettingsDetail, onShowAboutDetail }: {
  onShowSettingsDetail: () => void,
  onShowAboutDetail: () => void,
}) => {
  return (
    <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ display: "flex", gap: "12px" }}>
        <a
          id="settings"
          style={{
            color: "#6088ff",
            cursor: "pointer",
          }}
          onClick={() => onShowSettingsDetail()}
        >
          Settings
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
