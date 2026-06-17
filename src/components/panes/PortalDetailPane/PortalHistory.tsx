import { h } from "../../../utils/dom.ts";
import { PortalData } from "../../../types/ingress.ts";

const PortalHistory = ({ data }: { data: PortalData }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{ paddingTop: "8px", paddingBottom: "8px", fontSize: "12px", color: "#ccc" }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "stretch" }}>
        <div style={{ marginRight: "8px" }}>
          <strong>Visited:</strong> {data.history?.visited ? "✅" : "❌"}
        </div>
        <div style={{ marginRight: "8px" }}>
          <strong>Captured:</strong> {data.history?.captured ? "✅" : "❌"}
        </div>
        <div style={{ marginRight: "8px" }}>
          <strong>Scout Controlled:</strong> {data.history?.scoutControlled ? "✅" : "❌"}
        </div>
      </div>
    </div>
  </div>
);

export default PortalHistory;
