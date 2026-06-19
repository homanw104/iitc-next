import { h } from "../../../utils/dom.ts";
import AboutPaneButtonBar from "./AboutPaneButtonBar.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import BackButton from "../../atoms/BackButton/BackButton.tsx";

const AboutPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>About IITC Next</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <BackButton onClick={onBack} />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div style={{ color: "#aaa" }}>
        Version {__IITC_NEXT_VERSION__}
      </div>

      <div style={{ marginTop: "20px" }}>
        IITC Next is a Total Conversion for Ingress Intel that adds a 3D globe view, powered by CesiumJS.
      </div>

      <AboutPaneButtonBar />
    </div>
  ) as HTMLElement;
};

export default AboutPane;
