import { h } from "../../../utils/dom.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { PortalData } from "../../../types/ingress.ts";
import PortalTitle from "./PortalTitle.tsx";
import PortalImage from "./PortalImage.tsx";
import PortalMods from "./PortalMods.tsx";
import PortalResonators from "./PortalResonators.tsx";
import PortalHistory from "./PortalHistory.tsx";
import PortalLink from "./PortalLink.tsx";

const PortalDetailPane = ({ data, onCopy }: {
  data: PortalData,
  onCopy: (link: string) => void
}) => {
  const teamColor = getTeamColor(data.team);
  const teamColorHex = teamColor.toCssColorString();

  return (
    <div
      unselectable={true}
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "var(--iitc-left-control-padding, 5px)",
        bottom: "calc(var(--iitc-bottom-control-padding, 5px) + 38px)",
        margin: "2px 3px",
        border: `1px solid ${teamColorHex}`,
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-left-control-padding, 5px) - var(--iitc-right-control-padding, 5px) - 32px)",
        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding - 2 * button - 2 * margin compensate
        maxHeight: "calc(100% - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 116px)",

        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "12px",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        fontFamily: "sans-serif",
        pointerEvents: "auto",
        overflow: "scroll",
        zIndex: "10020",
      }}
    >
      <PortalTitle data={data} teamColorHex={teamColorHex} />
      <PortalImage data={data} />
      <PortalMods data={data} teamColorHex={teamColorHex} />
      <PortalResonators data={data} teamColorHex={teamColorHex} />
      <PortalHistory data={data} />
      <PortalLink data={data} onCopy={onCopy} />
    </div>
  ) as HTMLElement;
};

export default PortalDetailPane;
