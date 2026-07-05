import { playerInfoManager } from "../../../managers/game/playerInfoManager.ts";
import type { RedeemManager, RedeemResult } from "../../../managers/game/redeemManager.ts";
import type { ScoreManager } from "../../../managers/game/scoreManager.ts";
import { h } from "../../../utils/dom.ts";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";
import GameRedeem from "./GameRedeem.tsx";
import GameScore from "./GameScore.tsx";
import PlayerInfo from "./PlayerInfo.tsx";
import PlayerStatus from "./PlayerStatus.tsx";
import ProfilePaneButtonBar from "./ProfilePaneButtonBar.tsx";

const ProfilePane = ({
  scoreManager,
  redeemManager,
  onClose,
  onShowRedeemResult,
  onShowSettingsDetail,
  onShowAboutDetail,
}: {
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
  onClose: () => void,
  onShowRedeemResult: (result: RedeemResult) => void,
  onShowSettingsDetail: () => void,
  onShowAboutDetail: () => void,
}) => {
  const player = playerInfoManager.getPlayerInfo();

  return (
    <div
      style={{
        position: "absolute",
        left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
        top: "calc(var(--iitc-system-top-inset, 0px) + 43px)",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 42px)",
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
      <GameRedeem redeemManager={redeemManager} onShowRedeemResult={onShowRedeemResult} />
      <ProfilePaneButtonBar onShowSettingsDetail={onShowSettingsDetail} onShowAboutDetail={onShowAboutDetail} />
    </div>
  ) as HTMLElement;
};

export default ProfilePane;
