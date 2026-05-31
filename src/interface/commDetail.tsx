import * as Cesium from "cesium";
import { Viewer } from "cesium";
import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";
import { CommManager, Plext } from "../managers/commManager";
import { logManager } from "../managers/logManager";

type Channel = "all" | "faction" | "alerts";

const CommMessage = ({ plext, viewer, channel }: {
  plext: Plext;
  viewer: Viewer;
  channel: Channel;
}) => {
  const dateObj = new Date(plext.timestamp);
  let timeStr: string;
  if (dateObj.toDateString() === new Date(Date.now()).toDateString()) {
    timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    timeStr = dateObj.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  return (
    <div style={{ marginBottom: "8px", display: "flex", flexDirection: "row" }}>
      <div
        style={{ fontSize: "12px", color: "rgba(214, 254, 250, 0.5)", minWidth: "75px", width: "75px" }}
        title={dateObj.toLocaleString()}
      >
        {timeStr}
      </div>
      <div style={{ fontSize: "12px", paddingBottom: "2px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {plext.markup.map(([type, data]) => {
          let color = "white";
          if (data.team === "ENLIGHTENED") color = getTeamColor("ENLIGHTENED").toCssColorString();
          if (data.team === "RESISTANCE") color = getTeamColor("RESISTANCE").toCssColorString();
          if (data.team === "MACHINA") color = getTeamColor("MACHINA").toCssColorString();

          if (type === "PLAYER" || type === "SENDER") {
            return <span style={{ color, fontWeight: "bold", marginRight: "3px" }}>{data.plain}</span>;
          } else if (type === "PORTAL") {
            return (
              <span
                style={{ color: "#bbb", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  if (data.latE6 && data.lngE6) {
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6, 6e2),
                      duration: 1.5,
                    });
                  }
                }}
              >
                {data.plain}
              </span>
            );
          } else if (type === "SECURE") {
            if (channel === "all") {
              return <span style={{ color: "#f88" }}>{data.plain}</span>;
            } else {
              return;
            }
          } else {
            return <span style={{ color: color }}>{data.plain}</span>;
          }
        })}
      </div>
    </div>
  );
};

const CommTab = ({ id, label, isActive, onClick }: {
  id: Channel;
  label: string;
  isActive: boolean;
  onClick: (tab: Channel) => void;
}) => (
  <button
    id={`comm-tab-${id}`}
    onClick={() => onClick(id)}
    style={{
      background: "none",
      border: "none",
      borderBottom: isActive ? "2px solid #ffce00" : "2px solid rgba(0, 0, 0, 0)",
      fontWeight: isActive ? "bold" : "normal",
      color: "white",
      cursor: "pointer",
      width: "80px",
      padding: "8px 8px 16px 8px",
    }}
  >
    {label}
  </button>
);

const CommLoading = ({ onRef }: {
  onRef: (el: HTMLElement) => void;
}) => (
  <div ref={onRef} style={{ marginBottom: "8px", display: "flex", flexDirection: "row" }}>
    <div style={{ fontSize: "14px", paddingBottom: "2px", color: "rgba(214, 254, 250, 0.5)" }}>Loading...</div>
  </div>
);

const CommFetchLatestButton = ({ onRef, onClick, isLoading }: {
  onRef?: (el: HTMLElement) => void;
  onClick: () => void;
  isLoading: boolean;
}) => (
  <button
    ref={onRef}
    onClick={() => onClick()}
    disabled={isLoading}
    style={{
      border: "none",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "14px",
      padding: "4px 0px",
      color: "rgba(214, 254, 250, 0.5)",
      textDecoration: isLoading ? "none" : "underline",
      cursor: isLoading ? "default" : "pointer",
    }}
  >
    {isLoading ? "Loading..." : "Fetch latest messages"}
  </button>
);

const CommTextInput = ({ onRef }: {
  onRef?: (el: HTMLInputElement) => void;
}) => (
  <input
    ref={onRef}
    type="text"
    placeholder="Broadcast message"
    style={{
      border: "none",
      backgroundColor: "#303030",
      color: "white",
      padding: "1px 4px",
      cursor: "pointer",
      borderRadius: "2px",
      fontSize: "13px",
      maxWidth: "75%",
    }}
  />
);

const CommSendButton = ({ onRef }: {
  onRef?: (el: HTMLInputElement) => void;
}) => (
  <button
    ref={onRef}
    type="button"
    style={{
      border: "none",
      backgroundColor: "#303030",
      color: "white",
      padding: "1px 4px",
      cursor: "pointer",
      borderRadius: "2px",
      fontSize: "13px",
      maxWidth: "75%",
    }}
  >
    Send
  </button>
);

const CommCloseButton = ({ onRef, onClick }: {
  onRef?: (el: HTMLElement) => void;
  onClick: () => void;
}) => (
  <button
    ref={onRef}
    onclick={() => onClick()}
    type="button"
    style={{
      padding: "0px",
      border: "none",
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "white",
      cursor: "pointer",
    }}
  >
    <svg viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
      <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  </button>
);

const CommPane = ({
  viewer,
  commManager,
  channel,
  isFetchingNew,
  onTabClick,
  onCloseClick,
  onFetchLatestClick,
  onLoadingDivRef,
  onMessageDivsRef,
  onScroll,
}: {
  viewer: Viewer;
  commManager: CommManager;
  channel: Channel;
  isFetchingNew: boolean;
  onTabClick: (tab: Channel) => void;
  onCloseClick: () => void;
  onFetchLatestClick: () => void;
  onLoadingDivRef: (el: HTMLElement) => void;
  onMessageDivsRef: (el: HTMLElement) => void;
  onScroll: (e: Event) => void;
}) => {
  const messages = commManager.getMessages(channel);

  const tabs: { id: Channel; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "faction", label: "FACTION" },
    { id: "alerts", label: "ALERTS" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: "41px",
        right: "5px",
        margin: "2px 3px",
        width: "600px",
        height: "500px",
        maxWidth: "calc(100% - 18px - 24px)",
        maxHeight: "calc(100% - 16px - 24px)",
        display: "flex",
        flexDirection: "column",
        padding: "12px",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        zIndex: "10015",
      }}
    >
      <div
        className="comm-tabs"
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid #555",
        }}
      >
        <div style={{ display: "flex", gap: "10px" }}>
          {tabs.map((tab) => (
            <CommTab
              id={tab.id}
              label={tab.label}
              isActive={channel === tab.id}
              onClick={onTabClick}
            />
          ))}
        </div>
        <CommCloseButton onClick={onCloseClick} />
      </div>
      <div
        ref={onMessageDivsRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: "auto", paddingRight: "5px", position: "relative" }}
      >
        <CommLoading onRef={onLoadingDivRef} />
        <div style={{ minHeight: "100%" }}>
          {messages.map((plext) => (
            <CommMessage plext={plext} viewer={viewer} channel={channel} />
          ))}
        </div>
        <CommFetchLatestButton
          onClick={onFetchLatestClick}
          isLoading={isFetchingNew}
        />
      </div>
      <form
        style={{ display: "flex" , flexDirection: "row", alignItems: "center", gap: "8px" }}
      >
        <div style={{ flex: 1 }}>
          <CommTextInput />
        </div>
        <div>
          <CommSendButton />
        </div>
      </form>
    </div>
  ) as HTMLElement;
};

class CommUI {
  private readonly viewer: Viewer;
  private readonly commManager: CommManager;

  private container: HTMLElement;
  private pane: HTMLElement | null = null;
  private loadingDiv: HTMLElement | null = null;
  private messageDivs: HTMLElement | null = null;

  private currentChannel: Channel = "all";
  private isFetchingNew = false;
  private isFetchingOld = false;
  private isUpdatingScroll = false;
  private refreshInterval: any = null;

  private refreshNewMsgCount = new Map([["all", 0], ["faction", 0], ["alerts", 0]]);
  private previousScrollHeights: Map<string, number> = new Map([["all", 0], ["faction", 0], ["alerts", 0]]);
  private previousScrollTops: Map<string, number> = new Map([["all", 0], ["faction", 0], ["alerts", 0]]);

  constructor(viewer: Viewer, container: HTMLElement, commManager: CommManager) {
    this.viewer = viewer;
    this.container = container;
    this.commManager = commManager;
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
      const msgCount = this.commManager.getMessages(channel).length;

      if (channel === "all") await this.commManager.requestAll(fetchOld);
      if (channel === "faction") await this.commManager.requestFaction(fetchOld);
      if (channel === "alerts") await this.commManager.requestAlerts(fetchOld);

      const newMsgCount = this.commManager.getMessages(channel).length - msgCount;
      logManager.info("CommDetailPane", `Received ${newMsgCount} message${newMsgCount === 1 ? "" : "s"} from ${channel} channel`);
      this.refreshNewMsgCount.set(channel, newMsgCount);
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
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private showPane(): void {
    this.pane = this.createPaneEl();
    this.container.appendChild(this.pane);
    if (this.messageDivs) this.messageDivs.scrollTop = this.previousScrollTops.get(this.currentChannel) || 0;

    const messages = this.commManager.getMessages(this.currentChannel);
    if (messages.length === 0) {
      this.refreshData().then(() => this.renderPane());
      this.renderPane();
    }

    this.refreshInterval = setInterval(() => {
      this.refreshData().then(() => this.renderPane());
      this.renderPane();
    }, 30000);
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
      // Setting scrollTop triggers a 'scroll' event asynchronously or synchronously depending on the browser.
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
        channel={this.currentChannel}
        isFetchingNew={this.isFetchingNew}
        onTabClick={this.handleTabClick}
        onCloseClick={this.handleCloseClick}
        onFetchLatestClick={this.handleFetchLatestClick}
        onLoadingDivRef={(el: HTMLElement) => (this.loadingDiv = el)}
        onMessageDivsRef={(el: HTMLElement) => (this.messageDivs = el)}
        onScroll={this.handleScroll}
      />
    ) as HTMLElement;
  }

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
  }

  private handleFetchLatestClick = () => {
    this.refreshData().then(() => this.renderPane());
    this.renderPane();
  }
}

let commUIInstance: CommUI | null = null;

export function addCommDetailButton(viewer: Viewer, container: HTMLElement, commManager: CommManager): void {
  if (!commUIInstance) {
    commUIInstance = new CommUI(viewer, container, commManager);
  }

  const ui = (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "43px",
        zIndex: "10012",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        title="COMM"
        className="cesium-button cesium-toolbar-button"
        onClick={() => commUIInstance?.togglePane()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
          <path d="M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
