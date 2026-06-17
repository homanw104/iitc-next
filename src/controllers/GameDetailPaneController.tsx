import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import GameDetailPane from "../components/panes/GameDetailPane/GameDetailPane";
import PluginDetailPane from "../components/panes/PluginDetailPane/PluginDetailPane";
import SettingsDetailPane from "../components/panes/SettingsDetailPane/SettingsDetailPane";
import AboutDetailPane from "../components/panes/AboutDetailPane/AboutDetailPane";
import RedeemResultPane from "../components/panes/RedeemResultPane/RedeemResultPane";

export class GameDetailPaneController {
  private gameDetailPane: HTMLElement | null = null;
  private pluginDetailPane: HTMLElement | null = null;
  private settingsDetailPane: HTMLElement | null = null;
  private aboutDetailPane: HTMLElement | null = null;
  private redeemResultPane: HTMLElement | null = null;
  private readonly container: HTMLElement;
  private readonly scoreManager: ScoreManager;
  private readonly redeemManager: RedeemManager;

  constructor(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager) {
    this.container = container;
    this.scoreManager = scoreManager;
    this.redeemManager = redeemManager;
  }

  public toggleGameDetailPane() {
    if (this.gameDetailPane) {
      this.closeGameDetailPane();
      return;
    }
    if (this.pluginDetailPane) {
      this.closePluginDetailPane();
      return;
    }
    if (this.settingsDetailPane) {
      this.closeSettingsDetailPane();
      return;
    }
    if (this.aboutDetailPane) {
      this.closeAboutDetailPane();
      return;
    }
    this.showGameDetailPane(this.container);
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

  private closeSettingsDetailPane() {
    if (this.settingsDetailPane) {
      this.settingsDetailPane.remove();
      this.settingsDetailPane = null;
    }
  }

  private closeAboutDetailPane() {
    if (this.aboutDetailPane) {
      this.aboutDetailPane.remove();
      this.aboutDetailPane = null;
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
      onClose: () => this.closeGameDetailPane(),
      onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
      onShowSettingsDetail: () => this.showSettingsDetailPane(container),
      onShowAboutDetail: () => this.showAboutDetailPane(container),
    }));

    // Fetch score if there's no score
    if (this.scoreManager.getEnlScore() === 0 && this.scoreManager.getResScore() === 0) {
      this.scoreManager.fetchGameScore().then(() => {
        if (this.gameDetailPane) {
          this.closeGameDetailPane();
          this.gameDetailPane = container.appendChild(GameDetailPane({
            scoreManager: this.scoreManager,
            redeemManager: this.redeemManager,
            onClose: () => this.closeGameDetailPane(),
            onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
            onShowSettingsDetail: () => this.showSettingsDetailPane(container),
            onShowAboutDetail: () => this.showAboutDetailPane(container),
          }));
        }
      });
    }
  }

  private showPluginDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.closeAboutDetailPane();
    this.pluginDetailPane = container.appendChild(PluginDetailPane({ onClose: () => this.closePluginDetailPane() }));
  }

  private showSettingsDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeAboutDetailPane();
    this.settingsDetailPane = container.appendChild(SettingsDetailPane({
      onClose: () => this.closeSettingsDetailPane(),
      onShowPluginDetail: () => this.showPluginDetailPane(container),
    }));
  }

  private showAboutDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.aboutDetailPane = container.appendChild(AboutDetailPane({ onClose: () => this.closeAboutDetailPane() }));
  }

  private showRedeemResultPane(container: HTMLElement, msg: string) {
    this.closeRedeemResultPane();
    this.redeemResultPane = container.appendChild(RedeemResultPane({ msg, onClose: () => this.closeRedeemResultPane() }));
  }
}
