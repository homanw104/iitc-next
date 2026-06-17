import { h } from "../../../utils/dom.ts";
import { getPlayerInfo } from "../../../utils/player.ts";
import { ScoreManager } from "../../../managers/scoreManager.ts";
import { RedeemManager } from "../../../managers/redeemManager.ts";
import PlayerInfo from "./PlayerInfo.tsx";
import PlayerStatus from "./PlayerStatus.tsx";
import GameScore from "./GameScore.tsx";
import GameRedeem from "./GameRedeem.tsx";
import GameDetailButtonBar from "./GameDetailButtonBar.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const GameDetailPane = ({
  scoreManager,
  redeemManager,
  onClose,
  onRedeemSuccess,
  onShowPluginDetail,
  onShowAboutDetail,
}: {
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
  onClose: () => void,
  onRedeemSuccess: (result: string) => void,
  onShowPluginDetail: () => void,
  onShowAboutDetail: () => void,
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
        <PlayerInfo player={player} />
        <CloseButton onClose={onClose} />
      </div>
      <PlayerStatus player={player} />
      <GameScore scoreManager={scoreManager} />
      <GameRedeem redeemManager={redeemManager} onRedeemSuccess={onRedeemSuccess} />
      <GameDetailButtonBar onShowPluginDetail={onShowPluginDetail} onShowAboutDetail={onShowAboutDetail} />
    </div>
  ) as HTMLElement;
};

export default GameDetailPane;
