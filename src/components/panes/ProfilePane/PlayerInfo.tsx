import type { Player } from "../../../types/iitc/player.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h } from "../../../utils/dom.ts";

const PlayerInfo = ({ player }: {
  player?: Player;
}) => {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <span style={{
        fontSize: "24px",
        color: player ? getTeamColor(player.team).toCssColorString() : "#ffffff",
      }}>
        {player ? player.nickname : "Unknown"}
      </span>
      <span style={{
        fontSize: "24px",
        color: "#ffffff",
      }}>
        {player ? player.verifiedLevel && "-" : ""}
      </span>
      <span style={{
        fontSize: "24px",
        fontStyle: "bold",
        color: "#ffffff",
      }}>
        {player ? player.verifiedLevel && "L" + player.verifiedLevel.toString() : ""}
      </span>
    </div>
  );
};

export default PlayerInfo;
