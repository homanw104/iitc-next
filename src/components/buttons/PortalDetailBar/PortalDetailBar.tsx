import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalData } from "../../../types/iitc/portal.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h } from "../../../utils/dom.ts";

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
        left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 5px)",
        margin: "2px 3px",
        height: "30px",
        width: "400px",
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 156px)",
        paddingLeft: "12px",
        paddingRight: "12px",
        fontSize: "14px",
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
      }} ref={portalDetailPaneController.setDetailBarTitleElement}>
        {portalDetailPaneController.getDetailBarTitleText(data, msg)}
      </div>
      <div ref={portalDetailPaneController.setDetailBarLevelElement}>
        {portalDetailPaneController.getDetailBarLevelText(data)}
      </div>
    </div>
  ) as HTMLElement;
};

export default PortalDetailBar;
