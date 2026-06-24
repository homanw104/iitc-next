import type { PortalData } from "../../../types/ingress.ts";
import { h } from "../../../utils/dom.ts";

const PortalImage = ({ data }: { data: PortalData }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{
      backgroundColor: "rgba(96, 96, 96, 0.9)",
      borderRadius: "4.2px",
    }}>
      <img
        src={data.image || ""}
        alt={data.title || "Loading..."}
        style={{
          width: "calc(100% - 16px)",
          aspectRatio: "4/3",
          padding: "8px",
          objectFit: "contain",
          borderRadius: "4.2px",
          display: "block",
        }}
      />
    </div>
  </div>
);

export default PortalImage;
