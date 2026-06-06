import { getTeamColor } from "../../utils/color";
import { h } from "../../utils/dom";
import { Player } from "../../types/ingress";

const PlayerInfo = ({ player }: {
  player?: Player;
}) => {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{
        fontSize: "24px",
        color: player ? getTeamColor(player.team).toCssColorString() : "#ffffff",
      }}>
        {player ? player.nickname : "Unknown"}
      </span>
      <span style={{
        fontSize: "24px",
        fontStyle: "bold",
        color: player ? getTeamColor(player.team).toCssColorString() : "#ffffff",
      }}>
        {player ? player.verifiedLevel && "L" + player.verifiedLevel.toString() : ""}
      </span>
    </div>
  );
};

export default PlayerInfo;
