/**
 * Functions that add a game detail button and pane to show player info and game status.
 */

import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";
import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import { getPlayerInfo } from "../utils/player";

let gameDetailPane: HTMLElement | null = null;

export function addGameDetailButton(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager): void {
  const ui = (
    <div
      style={{
        position: "absolute",
        top: "5px",
        left: "5px",
        zIndex: "10012",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="Game Details"
        onClick={() => toggleGameDetailPane(container, scoreManager, redeemManager)}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}

function toggleGameDetailPane(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager) {
  if (gameDetailPane) {
    gameDetailPane.remove();
    gameDetailPane = null;
  } else {
    showGameDetailPane(container, scoreManager, redeemManager);
  }
}

function showGameDetailPane(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager) {
  const player = getPlayerInfo();
  if (!player) return;

  const renderPane = () => {
    const totalEnl = scoreManager.getEnlScore();
    const totalRes = scoreManager.getResScore();
    const totalScore = totalEnl + totalRes;
    const enlPercentage = totalScore > 0 ? (totalEnl / totalScore) * 100 : 50;
    const resPercentage = totalScore > 0 ? (totalRes / totalScore) * 100 : 50;

    const pane = (
      <div
        ref={(el: HTMLElement) => (gameDetailPane = el)}
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
        }}
      >
        {/* Player info */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{
            fontSize: "24px",
            color: getTeamColor(player.team).toCssColorString(),
          }}>
            {player.nickname}
          </span>
          <span style={{
            fontSize: "24px",
            fontStyle: "bold",
            color: getTeamColor(player.team).toCssColorString(),
          }}>
            {player.verifiedLevel && "L" + player.verifiedLevel.toString()}
          </span>
        </div>

        {/* Player XM & AP */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{player.energy} / {player.xmCapacity} XM</span>
          <span>{player.ap} AP</span>
        </div>

        {/* Game scores */}
        <div style={{ marginTop: "20px" }}>Global Score</div>
        <div style={{ width: "100%", height: "24px", display: "flex", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            width: `${enlPercentage}%`,
            backgroundColor: getTeamColor("ENLIGHTENED").toCssColorString(),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white"
          }}>
            {Math.round(enlPercentage)}%
          </div>
          <div style={{
            width: `${resPercentage}%`,
            backgroundColor: getTeamColor("RESISTANCE").toCssColorString(),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white"
          }}>
            {Math.round(resPercentage)}%
          </div>
        </div>

        {/* Redeem */}
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
                const input = document.getElementById("redeem-input") as HTMLInputElement;
                if (input.value) {
                  redeemManager.requestRedeem(input.value).then((msg) => {
                    showRedeemResult(container, msg)
                  });
                }
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
              const input = document.getElementById("redeem-input") as HTMLInputElement;
              if (input.value) {
                redeemManager.requestRedeem(input.value).then((msg) => {
                  showRedeemResult(container, msg)
                });
              }
            }}
          >
            Redeem
          </button>
        </div>

        {/* Sign out */}
        <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "flex-end" }}>
          <a
            id="signout"
            href="https://intel.ingress.com/logout"
            style={{
              color: "#6088ff",
            }}
          >
            sign out
          </a>
        </div>
      </div>
    ) as HTMLElement;

    container.appendChild(pane);
  };

  renderPane();

  // Fetch score if there's no score
  if (scoreManager.getEnlScore() === 0 && scoreManager.getResScore() === 0) {
    scoreManager.fetchGameScore().then(() => {
      if (gameDetailPane) {
        renderPane();
      }
    });
  }
}

function showRedeemResult(container: HTMLElement, msg: string) {
  const popup = (
    <div style={{
      position: "absolute",
      top: "0px",
      left: "0px",
      bottom: "0px",
      right: "0px",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10030",
    }}>
      <div style={{
        position: "relative",
        width: "250px",
        height: "100px",
        padding: "12px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 32px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
      }}>
        <div style={{ marginRight: "42px" }}>
          {msg}
        </div>
        <div
          onclick={() => {closeRedeemResult(container, popup)}}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "24px",
            height: "24px",
            cursor: "pointer",
          }}
        >
          <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
          </svg>
        </div>
      </div>
    </div>
  ) as HTMLElement;
  container.appendChild(popup);
}

function closeRedeemResult(container: HTMLElement, popup: HTMLElement) {
  popup.remove();
}
