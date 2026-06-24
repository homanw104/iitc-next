import type { PortalData } from "../../../types/ingress.ts";
import { h } from "../../../utils/dom.ts";

const PortalTitle = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: "8px" }}>
        <div style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          height: "24px",
          fontSize: "16px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {data.title || "Loading..."}
        </div>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "8px" }}>
          <div style={{ height: "16px", fontSize: "12px" }}>Owner</div>
          <div style={{ height: "16px", fontSize: "12px", color: teamColorHex }}>{data.team == "NEUTRAL" ? "Unclaimed" : data.owner}</div>
        </div>
      </div>
      <div style={{ fontSize: "40px" }}>{data.level}</div>
    </div>
  </div>
);

export default PortalTitle;
