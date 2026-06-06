import { h } from "../../utils/dom";
import { getPlayerInfo } from "../../utils/player";
import { ScoreManager } from "../../managers/scoreManager";
import { RedeemManager } from "../../managers/redeemManager";
import PlayerInfo from "./PlayerInfo";
import PlayerStatus from "./PlayerStatus";
import GameScore from "./GameScore";
import GameRedeem from "./GameRedeem";
import ButtonBar from "./ButtonBar";

const GameDetailPane = ({ scoreManager, redeemManager, onRedeemSuccess, onShowPluginDetail }: {
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
  onRedeemSuccess: (result: string) => void,
  onShowPluginDetail: () => void,
}) => {
  const player = getPlayerInfo();

  return (
    <div
      style={{
        position: "absolute",
        left: "5px",
        top: "calc(5px + 36px + 2px)",
        padding: "12px",
        margin: "2px 3px",
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        zIndex: "10015",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
      }}
    >
      <PlayerInfo player={player} />
      <PlayerStatus player={player} />
      <GameScore scoreManager={scoreManager} />
      <GameRedeem redeemManager={redeemManager} onRedeemSuccess={onRedeemSuccess} />
      <ButtonBar onShowPluginDetail={onShowPluginDetail} />
    </div>
  ) as HTMLElement;
};

export default GameDetailPane;
