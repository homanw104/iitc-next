import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import GameDetailPane from "../components/GameDetailPane/GameDetailPane";
import PluginDetailPane from "../components/PluginDetailPane/PluginDetailPane";
import RedeemResultPane from "../components/RedeemResultPane/RedeemResultPane";

export class GameDetailPaneUI {
  private gameDetailPane: HTMLElement | null = null;
  private pluginDetailPane: HTMLElement | null = null;
  private redeemResultPane: HTMLElement | null = null;
  private readonly scoreManager: ScoreManager;
  private readonly redeemManager: RedeemManager;

  constructor(scoreManager: ScoreManager, redeemManager: RedeemManager) {
    this.scoreManager = scoreManager;
    this.redeemManager = redeemManager;
  }

  public toggleGameDetailPane(container: HTMLElement) {
    if (this.gameDetailPane) {
      this.closeGameDetailPane();
      return;
    }
    if (this.pluginDetailPane) {
      this.closePluginDetailPane();
      return;
    }
    this.showGameDetailPane(container);
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

  private showGameDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.gameDetailPane = container.appendChild(GameDetailPane({
      scoreManager: this.scoreManager,
      redeemManager: this.redeemManager,
      onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
      onShowPluginDetail: () => this.showPluginDetailPane(container),
    }));

    // Fetch score if there's no score
    if (this.scoreManager.getEnlScore() === 0 && this.scoreManager.getResScore() === 0) {
      this.scoreManager.fetchGameScore().then(() => {
        if (this.gameDetailPane) {
          this.closeGameDetailPane();
          container.appendChild(GameDetailPane({
            scoreManager: this.scoreManager,
            redeemManager: this.redeemManager,
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
