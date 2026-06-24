import { RedeemManager } from "../managers/game/redeemManager";
import { ScoreManager } from "../managers/game/scoreManager";
import { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";
import ProfilePane from "../components/panes/ProfilePane/ProfilePane.tsx";
import PluginSettingsPane from "../components/panes/PluginSettingsPane/PluginSettingsPane.tsx";
import SettingsPane from "../components/panes/SettingsPane/SettingsPane.tsx";
import LoggingSettingsPane from "../components/panes/LoggingSettingsPane/LoggingSettingsPane.tsx";
import RefreshIntervalSettingsPane from "../components/panes/RefreshIntervalSettingsPane/RefreshIntervalSettingsPane.tsx";
import GoogleTilesSettingsPane from "../components/panes/GoogleTilesSettingsPane/GoogleTilesSettingsPane.tsx";
import AboutPane from "../components/panes/AboutPane/AboutPane.tsx";
import RedeemResultPane from "../components/panes/RedeemResultPane/RedeemResultPane";

export class ProfilePaneController {
  private activePane: HTMLElement | null = null;
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
    if (this.activePane) {
      this.closeActivePane();
      return;
    }
    this.showGameDetailPane(this.container);
  }

  private closeActivePane() {
    if (this.activePane) {
      this.activePane.remove();
      this.activePane = null;
    }
  }

  private closeRedeemResultPane() {
    if (this.redeemResultPane) {
      this.redeemResultPane.remove();
      this.redeemResultPane = null;
    }
  }

  private showPane(container: HTMLElement, paneFactory: () => HTMLElement) {
    this.closeActivePane();
    this.activePane = container.appendChild(paneFactory());
  }

  private showGameDetailPane(container: HTMLElement) {
    const createPane = () => ProfilePane({
      scoreManager: this.scoreManager,
      redeemManager: this.redeemManager,
      onClose: () => this.closeActivePane(),
      onRedeemSuccess: (msg) => this.showRedeemResultPane(container, msg),
      onShowSettingsDetail: () => this.showSettingsDetailPane(container),
      onShowAboutDetail: () => this.showAboutDetailPane(container),
    });

    this.showPane(container, createPane);

    // Fetch score if there's no score
    if (this.scoreManager.getEnlScore() === 0 && this.scoreManager.getResScore() === 0) {
      this.scoreManager.fetchGameScore().then(() => {
        if (this.activePane) {
          this.showPane(container, createPane);
        }
      });
    }
  }

  private showPluginDetailPane(container: HTMLElement) {
    this.showPane(container, () => PluginSettingsPane({
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeActivePane(),
    }));
  }

  private showSettingsDetailPane(container: HTMLElement) {
    this.showPane(container, () => SettingsPane({
      onBack: () => this.showGameDetailPane(container),
      onClose: () => this.closeActivePane(),
      onShowGoogleTilesDetail: () => this.showGoogleTilesDetailPane(container),
      onShowRefreshIntervalDetail: () => this.showRefreshIntervalDetailPane(container),
      onShowLoggingDetail: () => this.showLoggingDetailPane(container),
      onShowPluginDetail: () => this.showPluginDetailPane(container),
    }));
  }

  private showLoggingDetailPane(container: HTMLElement) {
    this.showPane(container, () => LoggingSettingsPane({
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeActivePane(),
    }));
  }

  private showRefreshIntervalDetailPane(container: HTMLElement) {
    this.showPane(container, () => RefreshIntervalSettingsPane({
      tileRequestManager: this.tileRequestManager,
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeActivePane(),
    }));
  }

  private showGoogleTilesDetailPane(container: HTMLElement) {
    this.showPane(container, () => GoogleTilesSettingsPane({
      onBack: () => this.showSettingsDetailPane(container),
      onClose: () => this.closeActivePane(),
    }));
  }

  private showAboutDetailPane(container: HTMLElement) {
    this.showPane(container, () => AboutPane({
      onBack: () => this.showGameDetailPane(container),
      onClose: () => this.closeActivePane()
    }));
  }

  private showRedeemResultPane(container: HTMLElement, msg: string) {
    this.closeRedeemResultPane();
    this.redeemResultPane = container.appendChild(RedeemResultPane({ msg, onClose: () => this.closeRedeemResultPane() }));
  }
}
