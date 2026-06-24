import { Viewer } from "cesium";
import { h } from "../utils/dom";
import { Channel } from "../types/ingress";
import { CommManager } from "../managers/comm/commManager";
import { PortalEntityManager } from "../managers/entity/portalEntityManager";
import { PortalLabelEntityManager } from "../managers/entity/portalLabelEntityManager.ts";
import { PortalOrnamentEntityManager } from "../managers/entity/portalOrnamentEntityManager.ts";
import { PortalHistoryEntityManager } from "../managers/entity/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/entity/scoutHistoryEntityManager";
import { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";
import { logManager } from "../managers/system/logManager";
import CommPane from "../components/panes/CommPane/CommPane.tsx";
import type { PortalDetailPaneController } from "./PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../core/coreControllers";

const LOG_TAG = "CommPaneController";

export class CommPaneController {
  private readonly viewer: Viewer;
  private readonly commManager: CommManager;
  private readonly tileRequestManager: TileRequestManager;
  private readonly portalEntityManager: PortalEntityManager;
  private readonly portalLabelEntityManager: PortalLabelEntityManager;
  private readonly portalOrnamentEntityManager: PortalOrnamentEntityManager;
  private readonly portalHistoryEntityManager: PortalHistoryEntityManager;
  private readonly scoutHistoryEntityManager: ScoutHistoryEntityManager;
  private readonly portalDetailPaneController: PortalDetailPaneController;
  private readonly portalDetailState: PortalDetailState;

  private readonly container: HTMLElement;
  private pane: HTMLElement | null = null;
  private loadingDiv: HTMLElement | null = null;
  private messageDivs: HTMLElement | null = null;

  private currentChannel: Channel = "all";
  private isFetchingNew = false;
  private isFetchingOld = false;
  private isUpdatingScroll = false;
  private isInputFocused = false;

  private previousScrollHeights: Map<string, number> = new Map([]);
  private previousScrollTops: Map<string, number> = new Map([]);

  constructor(
    viewer: Viewer,
    container: HTMLElement,
    commManager: CommManager,
    tileRequestManager: TileRequestManager,
    portalEntityManager: PortalEntityManager,
    portalLabelEntityManager: PortalLabelEntityManager,
    portalOrnamentEntityManager: PortalOrnamentEntityManager,
    portalHistoryEntityManager: PortalHistoryEntityManager,
    scoutHistoryEntityManager: ScoutHistoryEntityManager,
    portalDetailPaneController: PortalDetailPaneController,
    portalDetailState: PortalDetailState
  ) {
    this.viewer = viewer;
    this.container = container;
    this.commManager = commManager;
    this.tileRequestManager = tileRequestManager;
    this.portalEntityManager = portalEntityManager;
    this.portalLabelEntityManager = portalLabelEntityManager;
    this.portalOrnamentEntityManager = portalOrnamentEntityManager;
    this.portalHistoryEntityManager = portalHistoryEntityManager;
    this.scoutHistoryEntityManager = scoutHistoryEntityManager;
    this.portalDetailPaneController = portalDetailPaneController;
    this.portalDetailState = portalDetailState;

    this.refreshData().then(() => this.renderPane());
    this.renderPane();

    window.setInterval(() => {
      if (this.isInputFocused) return;
      this.refreshData().then(() => this.renderPane());
      this.renderPane();
    }, 30000);
  }

  private async refreshData(fetchOld = false): Promise<void> {
    if (this.isFetchingNew || this.isFetchingOld) return;
    if (fetchOld) {
      this.isFetchingOld = true;
    } else {
      this.isFetchingNew = true;
    }

    try {
      const channel = this.currentChannel;
      const msgCount = this.commManager.getMessages(channel, false).length;

      // Always tries to fetch "all" channel and wait for 0.2 seconds before the next possible request
      await this.commManager.requestAll(fetchOld);
      await new Promise<void>(resolve => window.setTimeout(() => resolve(), 200));

      if (channel === "faction") await this.commManager.requestFaction(fetchOld);
      if (channel === "alerts") await this.commManager.requestAlerts(fetchOld);

      const newMsgCount = this.commManager.getMessages(channel, false).length - msgCount;
      logManager.info(LOG_TAG, `Received ${newMsgCount} new message${newMsgCount === 1 ? "" : "s"} from ${channel.toUpperCase()}`);
    } finally {
      this.isFetchingNew = false;
      this.isFetchingOld = false;
    }
  }

  public togglePane(): void {
    if (this.pane) {
      this.closePane();
    } else {
      this.showPane();
    }
  }

  private closePane(): void {
    if (this.pane) {
      this.pane.remove();
      this.pane = null;
      this.messageDivs = null;
    }
  }

  private showPane(): void {
    this.pane = this.createPaneEl();
    this.container.appendChild(this.pane);
    if (this.messageDivs) this.messageDivs.scrollTop =
      this.previousScrollTops.get(this.currentChannel) ||
      this.messageDivs.scrollHeight;

    const messages = this.commManager.getMessages(this.currentChannel);
    if (messages.length === 0) {
      this.refreshData().then(() => this.renderPane());
      this.renderPane();
    }
  }

  private renderPane(): void {
    if (!this.pane) return;

    const prevScrollTop = this.previousScrollTops.get(this.currentChannel) || 0;
    const prevScrollHeight = this.previousScrollHeights.get(this.currentChannel) || 0;
    const isAtBottom = this.messageDivs
      ? prevScrollTop + this.messageDivs.clientHeight >= prevScrollHeight - 20
      : true;

    const newPane = this.createPaneEl();
    this.pane.replaceWith(newPane);
    this.pane = newPane;

    if (this.messageDivs) {
      // We set isUpdatingScroll to true to prevent handleScroll from updating previousScrollTops
      // while we are programmatically adjusting the scroll position here.
      // Setting scrollTop triggers a "scroll" event asynchronously or synchronously depending on the browser.
      this.isUpdatingScroll = true;
      if (isAtBottom) {
        this.messageDivs.scrollTop = this.messageDivs.scrollHeight;
      } else {
        this.messageDivs.scrollTop = prevScrollTop + (this.messageDivs.scrollHeight - prevScrollHeight);
      }
      this.isUpdatingScroll = false;

      // Manually update stored values immediately after setting scrollTop.
      // This ensures that if another render happens before the next scroll event,
      // we use the correct base values.
      this.previousScrollTops.set(this.currentChannel, this.messageDivs.scrollTop);
      this.previousScrollHeights.set(this.currentChannel, this.messageDivs.scrollHeight);
    }

    // Loading div is at the top, and fetch latest button is at the bottom
    if (!this.isFetchingOld) {
      if (this.loadingDiv) this.loadingDiv.style.visibility = "hidden";
    } else {
      if (this.loadingDiv) this.loadingDiv.style.visibility = "show";
    }
  }

  private createPaneEl(): HTMLElement {
    return (
      <CommPane
        viewer={this.viewer}
        commManager={this.commManager}
        tileRequestManager={this.tileRequestManager}
        portalEntityManager={this.portalEntityManager}
        portalLabelEntityManager={this.portalLabelEntityManager}
        portalOrnamentEntityManager={this.portalOrnamentEntityManager}
        portalHistoryEntityManager={this.portalHistoryEntityManager}
        scoutHistoryEntityManager={this.scoutHistoryEntityManager}
        portalDetailPaneController={this.portalDetailPaneController}
        portalDetailState={this.portalDetailState}
        container={this.container}
        channel={this.currentChannel}
        isFetchingNew={this.isFetchingNew}
        onTabClick={this.handleTabClick}
        onCloseClick={this.handleCloseClick}
        onFetchLatestClick={this.handleFetchLatestClick}
        onSendMessage={this.handleSendMessage}
        onInputFocus={() => { this.isInputFocused = true; }}
        onInputBlur={() => { this.isInputFocused = false; }}
        onLoadingDivRef={(el: HTMLElement) => (this.loadingDiv = el)}
        onMessageDivsRef={(el: HTMLElement) => (this.messageDivs = el)}
        onScroll={this.handleScroll}
      />
    ) as HTMLElement;
  }

  private handleSendMessage = async (message: string) => {
    if (this.currentChannel === "alerts") {
      window.alert("__JARVIS__: A strange game. The only winning move is not to play. How about a nice game of chess?");
      return;
    }

    try {
      await this.commManager.sendMessage(this.currentChannel, message);
      window.setTimeout(() => {
        this.refreshData().then(() => this.renderPane());
      }, 1000);
    } catch (e) {
      logManager.warn(LOG_TAG, "Error sending message:", e);
    }
  };

  private handleScroll = async (e: Event) => {
    const el = e.target as HTMLElement;

    if (el.scrollTop === 0 && !this.isFetchingNew && !this.isFetchingOld) {
      this.refreshData(true).then(() => this.renderPane());
      this.renderPane();
    }

    // Only update stored scroll positions if the user triggered the scroll.
    // When isUpdatingScroll is true, it means renderPane() is programmatically
    // adjusting the scroll, and we should ignore those events to avoid recording
    // intermediate or incorrect scrollTop values.
    if (this.messageDivs && !this.isUpdatingScroll) {
      this.previousScrollTops.set(this.currentChannel, el.scrollTop);
      this.previousScrollHeights.set(this.currentChannel, el.scrollHeight);
    }
  };

  private handleTabClick = (tab: Channel) => {
    this.currentChannel = tab;
    const messages = this.commManager.getMessages(tab);
    if (messages.length === 0) this.refreshData().then(() => this.renderPane());
    this.renderPane();
  };

  private handleCloseClick = () => {
    this.closePane();
  };

  private handleFetchLatestClick = () => {
    this.refreshData().then(() => this.renderPane());
    this.renderPane();
  };
}
