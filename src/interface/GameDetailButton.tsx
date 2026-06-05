/**
 * Functions that show the game info pane, redeem pane, and plugin pane.
 */

import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";
import { getPlayerInfo } from "../utils/player";
import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import { pluginManager } from "../managers/pluginManager";

const GameDetailPane = ({ scoreManager, redeemManager, onRedeemSuccess, onShowPluginDetail }: {
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
  onRedeemSuccess: (result: string) => void,
  onShowPluginDetail: () => void,
}) => {
  const player = getPlayerInfo();
  const totalEnl = scoreManager.getEnlScore();
  const totalRes = scoreManager.getResScore();
  const totalScore = totalEnl + totalRes;
  const enlPercentage = totalScore > 0 ? (totalEnl / totalScore) * 100 : 50;
  const resPercentage = totalScore > 0 ? (totalRes / totalScore) * 100 : 50;

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
      {/* Player info */}
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

      {/* Player XM & AP */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{player ? player.energy : "0"} / {player ? player.xmCapacity : "0"} XM</span>
        <span>{player ? player.ap : "0"} AP</span>
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
                redeemManager.requestRedeem(input.value).then((msg) => onRedeemSuccess(msg));
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
              redeemManager.requestRedeem(input.value).then((msg) => onRedeemSuccess(msg));
            }
          }}
        >
          Redeem
        </button>
      </div>

      {/* Plugins and Sign out */}
      <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <a
          id="plugins"
          style={{
            color: "#6088ff",
            cursor: "pointer",
          }}
          onClick={() => onShowPluginDetail()}
        >
          Plugins
        </a>
        <a
          id="signout"
          href="https://intel.ingress.com/logout"
          style={{
            color: "#6088ff",
          }}
        >
          Sign out
        </a>
      </div>
    </div>
  ) as HTMLElement;
};

const PluginDetailPane = ({ onClose }: {
  onClose: () => void,
}) => {
  const plugins = pluginManager.getPlugins();

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
        maxHeight: "80vh",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        zIndex: "10016",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{ fontSize: "24px", fontWeight: "bold" }}>Plugins</span>
        <div
          onClick={() => onClose()}
          style={{ cursor: "pointer" }}
        >
          <svg viewBox="0 -960 960 960" width="24px" height="24px" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
          </svg>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {plugins.length === 0 && <div>No plugins registered.</div>}
        {plugins.map((plugin) => (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              borderRadius: "4px",
            }}
          >
            <div>
              <div style={{ fontWeight: "bold" }}>{plugin.name}</div>
              <div style={{ fontSize: "12px", color: "#aaa" }}>{plugin.id}</div>
            </div>
            <input
              type="checkbox"
              checked={pluginManager.isEnabled(plugin.id)}
              onClick={(e: Event) => {
                const target = e.target as HTMLInputElement;
                if (target.checked) {
                  pluginManager.enablePlugin(plugin.id);
                } else {
                  pluginManager.disablePlugin(plugin.id);
                }
              }}
              style={{
                width: "20px",
                height: "20px",
                cursor: "pointer",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  ) as HTMLElement;
}

const RedeemResultPane = ({ msg, onClose }: {
  msg: string,
  onClose: () => void,
}): HTMLElement => {
  return (
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
          onClick={() => onClose()}
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
}

class GameDetailUI {
  private gameDetailPane: HTMLElement | null = null;
  private pluginDetailPane: HTMLElement | null = null;
  private redeemResultPane: HTMLElement | null = null;

  public toggleGameDetailPane(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager) {
    if (this.gameDetailPane) {
      this.closeGameDetailPane();
      return;
    }
    if (this.pluginDetailPane) {
      this.closePluginDetailPane();
      return;
    }
    this.showGameDetailPane(container, scoreManager, redeemManager);
  }

  private closeGameDetailPane() {
    if (this.gameDetailPane) {
      this.gameDetailPane.remove();
      this.gameDetailPane = null;
    }
  }

  private closePluginDetailPane() {
    if (this.pluginDetailPane) {
      this.pluginDetailPane.remove();
      this.pluginDetailPane = null;
    }
  }

  private closeRedeemResultPane() {
    if (this.redeemResultPane) {
      this.redeemResultPane.remove();
      this.redeemResultPane = null;
    }
  }

  private showGameDetailPane(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager) {
    this.closeGameDetailPane();
    this.gameDetailPane = container.appendChild(GameDetailPane({
      scoreManager,
      redeemManager,
      onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
      onShowPluginDetail: () => this.showPluginDetailPane(container),
    }));

    // Fetch score if there's no score
    if (scoreManager.getEnlScore() === 0 && scoreManager.getResScore() === 0) {
      scoreManager.fetchGameScore().then(() => {
        if (this.gameDetailPane) {
          this.closeGameDetailPane();
          container.appendChild(GameDetailPane({
            scoreManager,
            redeemManager,
            onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
            onShowPluginDetail: () => this.showPluginDetailPane(container),
          }));
        }
      });
    }
  }

  private showPluginDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.pluginDetailPane = container.appendChild(PluginDetailPane({ onClose: () => this.closePluginDetailPane() }));
  }

  private showRedeemResultPane(container: HTMLElement, msg: string) {
    this.closeRedeemResultPane();
    this.redeemResultPane = container.appendChild(RedeemResultPane({ msg, onClose: () => this.closeRedeemResultPane() }));
  }
}

export const GameDetailButton = ({ container, scoreManager, redeemManager }: {
  container: HTMLElement,
  scoreManager: ScoreManager,
  redeemManager: RedeemManager,
}): HTMLElement => {
  const gameDetailUI = new GameDetailUI();

  return (
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
        onClick={() => gameDetailUI.toggleGameDetailPane(container, scoreManager, redeemManager)}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
}
