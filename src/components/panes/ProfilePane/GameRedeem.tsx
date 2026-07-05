import { playerInfoManager } from "../../../managers/game/playerInfoManager.ts";
import type { RedeemManager } from "../../../managers/game/redeemManager.ts";
import type { RedeemPlayerData, RedeemResponse } from "../../../types/api/redeemReward.ts";
import { h, Fragment } from "../../../utils/dom.ts";

const GameRedeem = ({ redeemManager, onShowRedeemResult }: {
  redeemManager: RedeemManager,
  onShowRedeemResult: (response: RedeemResponse) => void,
}) => {
  const redeem = () => {
    const input = document.getElementById("redeem-input") as HTMLInputElement;
    const passcode = input.value.trim();

    if (passcode) {
      redeemManager.requestRedeem(passcode)
        .then((response) => {
          if (response.playerData) {
            updatePlayerInfo(response.playerData);
          }

          onShowRedeemResult(response);
        })
        .catch((error: unknown) => onShowRedeemResult({ error }));
    }
  };

  return (
    <>
      <div style={{ marginTop: "20px" }}>Redeem Code</div>
      <div style={{ display: "flex", gap: "5px" }}>
        <input
          id="redeem-input"
          type="text"
          placeholder="Passcode"
          style={{
            flex: 1,
            backgroundColor: "#111",
            border: "1px solid #555",
            color: "white",
            padding: "4px 8px",
            borderRadius: "2px",
          }}
          onKeypress={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              redeem();
            }
          }}
        />
        <button
          style={{
            backgroundColor: "#5091ff",
            border: "1px solid #555",
            color: "white",
            height: "34px",
            padding: "4px 8px",
            borderRadius: "2px",
            fontFamily: "coda_regular, arial, helvetica, sans-serif",
            cursor: "pointer",
          }}
          onClick={() => {
            redeem();
          }}
        >
          Redeem
        </button>
      </div>
    </>
  );
};

function updatePlayerInfo(player: RedeemPlayerData): void {
  playerInfoManager.setPlayerInfo({
    ap: player.ap,
    availableInvites: player.available_invites,
    energy: player.energy,
    minApForCurrentLevel: Number(player.min_ap_for_current_level),
    minApForNextLevel: Number(player.min_ap_for_next_level),
    nickname: player.nickname,
    team: player.team,
    verifiedLevel: player.verified_level,
    xmCapacity: player.xm_capacity,
  });
}

export default GameRedeem;
