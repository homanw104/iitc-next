import { h } from "../../../utils/dom.ts";

const RedeemResultPane = ({ msg, onClose }: {
  msg: string,
  onClose: () => void,
}): HTMLElement => {
  return (
    <div style={{
      position: "absolute",
      top: "var(--iitc-system-top-inset, 0px)",
      left: "var(--iitc-system-left-inset, 0px)",
      bottom: "var(--iitc-system-bottom-inset, 0px)",
      right: "var(--iitc-system-right-inset, 0px)",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10030",
    }}>
      <div style={{
        position: "relative",
        width: "250px",
        height: "100px",
        padding: "12px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 32px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
      }}>
        <div style={{ marginRight: "42px" }}>
          {msg}
        </div>
        <div
          onClick={() => onClose()}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "24px",
            height: "24px",
            cursor: "pointer",
          }}
        >
          <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
          </svg>
        </div>
      </div>
    </div>
  ) as HTMLElement;
};

export default RedeemResultPane;
