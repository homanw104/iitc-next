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
  onShowSettingsDetail,
  onShowAboutDetail,
}: {
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
  onClose: () => void,
  onRedeemSuccess: (result: string) => void,
  onShowSettingsDetail: () => void,
  onShowAboutDetail: () => void,
}) => {
  const player = getPlayerInfo();

  return (
    <div
      style={{
        position: "absolute",
        left: "var(--iitc-left-control-padding, 5px)",
        top: "calc(var(--iitc-top-control-padding, 5px) + 38px)",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-left-control-padding, 5px) - var(--iitc-right-control-padding, 5px) - 32px)",
        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding - 2 * button - 2 * margin compensate
        maxHeight: "calc(100% - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 116px)",

        backgroundColor: "rgba(42, 42, 42, 0.9)",
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
      <GameDetailButtonBar onShowSettingsDetail={onShowSettingsDetail} onShowAboutDetail={onShowAboutDetail} />
    </div>
  ) as HTMLElement;
};

export default GameDetailPane;
