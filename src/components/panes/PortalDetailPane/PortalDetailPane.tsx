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
        left: "5px",
        bottom: "calc(5px + 36px + 2px)",
        padding: "12px",
        margin: "2px 3px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "12px",
        zIndex: "10020",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        fontFamily: "sans-serif",
        borderRadius: "4.2px",
        boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
        border: `1px solid ${teamColorHex}`,
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px)",
        maxHeight: "calc(100% - 14px - 36px - 24px - 43px)",
        pointerEvents: "auto",
        overflow: "scroll",
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
