import { h } from "../../../utils/dom.ts";
import { PortalData } from "../../../types/ingress.ts";

const PortalLink = ({ data, onCopy }: {
  data: PortalData,
  onCopy: (link: string) => void,
}) => {
  return (
    <div style={{ alignSelf: "stretch" }}>
      <div style={{
        padding: "8px 0px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "16px",
      }}>
        <a
          id="game-link"
          target="_blank"
          href={`https://link.ingress.com/portal/${data.guid}`}
          style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none", cursor: "pointer" }}
        >
          Open in game
        </a>
        <div
          id="intel-link"
          onclick={() => onCopy(`https://intel.ingress.com/?pll=${data.latE6 / 1e6},${data.lngE6 / 1e6}`)}
          style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none", cursor: "pointer" }}
        >
          Copy intel map link
        </div>
      </div>
    </div>
  );
};

export default PortalLink;
