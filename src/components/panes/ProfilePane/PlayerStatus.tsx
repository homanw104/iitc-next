import type { Player } from "../../../types/ingress.ts";
import { h } from "../../../utils/dom.ts";

const PlayerStatus = ({ player }: {
  player?: Player;
}) => {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{player ? player.energy : "0"} / {player ? player.xmCapacity : "0"} XM</span>
      <span>{player ? player.ap : "0"} AP</span>
    </div>
  );
};

export default PlayerStatus;
