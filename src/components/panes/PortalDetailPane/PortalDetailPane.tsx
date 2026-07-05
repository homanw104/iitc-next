import type { PortalData } from "../../../types/iitc/portal.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h } from "../../../utils/dom.ts";
import PortalHistory from "./PortalHistory.tsx";
import PortalImage from "./PortalImage.tsx";
import PortalLink from "./PortalLink.tsx";
import PortalMods from "./PortalMods.tsx";
import PortalResonators from "./PortalResonators.tsx";
import PortalTitle from "./PortalTitle.tsx";

const PortalDetailPane = ({ data, onCopy }: {
  data: PortalData,
  onCopy: (link: string) => void,
}) => {
  const teamColor = getTeamColor(data.team);
  const teamColorHex = teamColor.toCssColorString();

  return (
    <div
      unselectable={true}
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
        margin: "2px 3px",
        border: `1px solid ${teamColorHex}`,
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 42px)",
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
