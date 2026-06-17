import { h } from "../../../utils/dom.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { PortalData } from "../../../types/ingress.ts";
import { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";

const PortalDetailBar = ({ portalDetailPaneController, data, msg }: {
  portalDetailPaneController: PortalDetailPaneController,
  data?: PortalData,
  msg?: string,
}): HTMLElement => {
  return (
    <div
      onClick={() => portalDetailPaneController.toggleDetailPane(data)}
      style={{
        position: "absolute",
        left: "5px",
        bottom: "5px",
        margin: "2px 3px",
        height: "30px",
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px - 114px)",
        paddingLeft: "12px",
        paddingRight: "12px",
        fontSize: "14px",
        zIndex: "10000",
        backgroundColor: "rgb(48, 51, 54)",
        color: "white",
        fontFamily: "sans-serif",
        borderRadius: "4.2px",
        border: `1px solid ${data ? getTeamColor(data.team).toCssColorString() : "rgb(68, 68, 68)"}`,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    >
      <div style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {(data && data.title) || msg || "Loading..."}
      </div>
      <div>
        {data && data.level && "L" + data.level || ""}
      </div>
    </div>
  ) as HTMLElement;
};

export default PortalDetailBar;
