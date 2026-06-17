import { h } from "../../../utils/dom.ts";
import AboutDetailButtonBar from "./AboutDetailButtonBar.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import BackButton from "../../atoms/BackButton/BackButton.tsx";

const AboutDetailPane = ({ onBack, onClose }: {
  onBack: () => void,
  onClose: () => void,
}) => {
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

      <AboutDetailButtonBar />
    </div>
  ) as HTMLElement;
};

export default AboutDetailPane;
