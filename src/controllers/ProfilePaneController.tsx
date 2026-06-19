import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import { TileRequestManager } from "../managers/tileRequestManager";
import ProfilePane from "../components/panes/ProfilePane/ProfilePane.tsx";
import PluginSettingsPane from "../components/panes/PluginSettingsPane/PluginSettingsPane.tsx";
import SettingsPane from "../components/panes/SettingsPane/SettingsPane.tsx";
import LoggingSettingsPane from "../components/panes/LoggingSettingsPane/LoggingSettingsPane.tsx";
import RefreshIntervalSettingsPane from "../components/panes/RefreshIntervalSettingsPane/RefreshIntervalSettingsPane.tsx";
import AboutPane from "../components/panes/AboutPane/AboutPane.tsx";
import RedeemResultPane from "../components/panes/RedeemResultPane/RedeemResultPane";

export class ProfilePaneController {
  private gameDetailPane: HTMLElement | null = null;
  private pluginDetailPane: HTMLElement | null = null;
  private settingsDetailPane: HTMLElement | null = null;
  private loggingDetailPane: HTMLElement | null = null;
  private refreshIntervalDetailPane: HTMLElement | null = null;
  private aboutDetailPane: HTMLElement | null = null;
  private redeemResultPane: HTMLElement | null = null;
  private readonly container: HTMLElement;
  private readonly scoreManager: ScoreManager;
  private readonly redeemManager: RedeemManager;
  private readonly tileRequestManager: TileRequestManager;

  constructor(container: HTMLElement, scoreManager: ScoreManager, redeemManager: RedeemManager, tileRequestManager: TileRequestManager) {
    this.container = container;
    this.scoreManager = scoreManager;
    this.redeemManager = redeemManager;
    this.tileRequestManager = tileRequestManager;
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
    if (this.loggingDetailPane) {
      this.closeLoggingDetailPane();
      return;
    }
    if (this.refreshIntervalDetailPane) {
      this.closeRefreshIntervalDetailPane();
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

  private closeLoggingDetailPane() {
    if (this.loggingDetailPane) {
      this.loggingDetailPane.remove();
      this.loggingDetailPane = null;
    }
  }

  private closeRefreshIntervalDetailPane() {
    if (this.refreshIntervalDetailPane) {
      this.refreshIntervalDetailPane.remove();
      this.refreshIntervalDetailPane = null;
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
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.closeAboutDetailPane();
    this.gameDetailPane = container.appendChild(ProfilePane({
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
          this.gameDetailPane = container.appendChild(ProfilePane({
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
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.closeAboutDetailPane();
    this.pluginDetailPane = container.appendChild(PluginSettingsPane({
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closePluginDetailPane(),
    }));
  }

  private showSettingsDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.closeAboutDetailPane();
    this.settingsDetailPane = container.appendChild(SettingsPane({
      onBack: () => this.showGameDetailPane(container),
      onClose: () => this.closeSettingsDetailPane(),
      onShowRefreshIntervalDetail: () => this.showRefreshIntervalDetailPane(container),
      onShowLoggingDetail: () => this.showLoggingDetailPane(container),
      onShowPluginDetail: () => this.showPluginDetailPane(container),
    }));
  }

  private showLoggingDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.closeAboutDetailPane();
    this.loggingDetailPane = container.appendChild(LoggingSettingsPane({
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeLoggingDetailPane(),
    }));
  }

  private showRefreshIntervalDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.closeAboutDetailPane();
    this.refreshIntervalDetailPane = container.appendChild(RefreshIntervalSettingsPane({
      tileRequestManager: this.tileRequestManager,
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeRefreshIntervalDetailPane(),
    }));
  }

  private showAboutDetailPane(container: HTMLElement) {
    this.closeGameDetailPane();
    this.closePluginDetailPane();
    this.closeSettingsDetailPane();
    this.closeLoggingDetailPane();
    this.closeRefreshIntervalDetailPane();
    this.aboutDetailPane = container.appendChild(AboutPane({
      onBack: () => this.showGameDetailPane(container),
      onClose: () => this.closeAboutDetailPane()
    }));
  }

  private showRedeemResultPane(container: HTMLElement, msg: string) {
    this.closeRedeemResultPane();
    this.redeemResultPane = container.appendChild(RedeemResultPane({ msg, onClose: () => this.closeRedeemResultPane() }));
  }
}
