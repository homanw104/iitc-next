import * as Cesium from "cesium";
import { Viewer } from "cesium";
import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";
import { CommManager, Plext } from "../managers/commManager";

type Channel = "all" | "faction" | "alerts";

const CommMessage = ({ plext, viewer, currentChannel }: {
  plext: Plext;
  viewer: Viewer;
  currentChannel: Channel;
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
          console.log(type, data);
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
            if (currentChannel === "all") {
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
      padding: "4px 8px",
    }}
  >
    {label}
  </button>
);

const CommLoading = () => (
  <div style={{ marginBottom: "8px", display: "flex", flexDirection: "row" }}>
    <div style={{ fontSize: "14px", paddingBottom: "2px", color: "rgba(214, 254, 250, 0.5)" }}>Loading...</div>
  </div>
);

const CommFetchLatestButton = ({ onRef, onClick, isLoading }: {
  onRef: (el: HTMLElement) => void;
  onClick: () => void;
  isLoading: boolean;
}) => (
  <div
    ref={onRef}
    onClick={onClick}
    style={{
      display: "none",
      position: "absolute",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "#ffce00",
      color: "black",
      padding: "5px 10px",
      borderRadius: "10px",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "bold",
      boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
      zIndex: "10016",
    }}
  >
    {isLoading ? "Loading..." : "Fetch latest messages"}
  </div>
);

class CommUI {
  private readonly viewer: Viewer;
  private container: HTMLElement;
  private commManager: CommManager;
  private pane: HTMLElement | null = null;
  private messageList: HTMLElement | null = null;
  private fetchLatestBtn: HTMLElement | null = null;
  private currentChannel: Channel = "all";
  private isFetching = false;
  private refreshInterval: any = null;

  constructor(viewer: Viewer, container: HTMLElement, commManager: CommManager) {
    this.viewer = viewer;
    this.container = container;
    this.commManager = commManager;
  }

  public toggle(): void {
    if (this.pane) {
      this.close();
    } else {
      this.show();
    }
  }

  public close(): void {
    if (this.pane) {
      this.pane.remove();
      this.pane = null;
      this.messageList = null;
      this.fetchLatestBtn = null;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refresh(fetchOld = false): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;
    this.updateFetchButtonState();

    try {
      const channel = this.currentChannel;
      if (channel === "all") await this.commManager.requestAll(fetchOld);
      else if (channel === "faction") await this.commManager.requestFaction(fetchOld);
      else if (channel === "alerts") await this.commManager.requestAlerts(fetchOld);

      if (this.pane && this.currentChannel === channel) {
        this.renderMessages();
      }
    } finally {
      this.isFetching = false;
      this.updateFetchButtonState();
    }
  }

  private updateFetchButtonState(): void {
    if (this.fetchLatestBtn) {
      this.fetchLatestBtn.textContent = this.isFetching ? "Loading..." : "Fetch latest messages";
    }
  }

  private handleScroll = async (e: Event) => {
    const el = e.target as HTMLElement;
    if (this.isFetching) return;

    if (el.scrollTop === 0) {
      await this.refresh(true);
    }

    if (this.fetchLatestBtn) {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5;
      this.fetchLatestBtn.style.display = isAtBottom ? "block" : "none";
    }
  };

  private handleTabClick = (tab: Channel) => {
    this.currentChannel = tab;
    this.renderTabs();
    this.renderMessages();
  };

  private renderTabs(): void {
    const tabs: { id: Channel; label: string }[] = [
      { id: "all", label: "ALL" },
      { id: "faction", label: "FACTION" },
      { id: "alerts", label: "ALERTS" },
    ];

    const tabContainer = this.pane?.querySelector(".comm-tabs");
    if (tabContainer) {
      tabContainer.innerHTML = "";
      tabs.forEach((tab) => {
        tabContainer.appendChild(
          <CommTab
            id={tab.id}
            label={tab.label}
            isActive={this.currentChannel === tab.id}
            onClick={this.handleTabClick}
          /> as HTMLElement
        );
      });
    }
  }

  private renderMessages(): void {
    if (!this.messageList) return;

    const messages = this.commManager.getMessages(this.currentChannel);

    if (messages.length === 0) {
      this.messageList.innerHTML = "";
      this.messageList.appendChild(<CommLoading /> as HTMLElement);
      this.refresh().then();
      return;
    }

    const previousScrollHeight = this.messageList.scrollHeight;
    const previousScrollTop = this.messageList.scrollTop;
    const isAtBottom = previousScrollTop + this.messageList.clientHeight >= previousScrollHeight - 20;

    this.messageList.innerHTML = "";
    this.messageList.appendChild(<CommLoading /> as HTMLElement);
    messages.forEach((plext) => {
      this.messageList!.appendChild(
        <CommMessage plext={plext} viewer={this.viewer} currentChannel={this.currentChannel} /> as HTMLElement
      );
    });

    this.messageList.appendChild(<div style={{ height: "60px" }}></div> as HTMLElement);

    if (isAtBottom) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    } else {
      this.messageList.scrollTop = previousScrollTop + (this.messageList.scrollHeight - previousScrollHeight);
    }
  }

  private show(): void {
    this.pane = (
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
            gap: "10px",
            marginBottom: "8px",
            borderBottom: "1px solid #555",
            paddingBottom: "5px",
          }}
        ></div>
        <div
          ref={(el: HTMLElement) => (this.messageList = el)}
          onScroll={this.handleScroll}
          style={{ flex: 1, overflowY: "auto", paddingRight: "5px", position: "relative" }}
        ></div>
        <CommFetchLatestButton
          onRef={(el: HTMLElement) => (this.fetchLatestBtn = el)}
          onClick={async () => {
            if (this.messageList) this.messageList.scrollTop = this.messageList.scrollHeight;
            await this.refresh();
          }}
          isLoading={this.isFetching}
        />
      </div>
    ) as HTMLElement;

    this.container.appendChild(this.pane);
    this.renderTabs();
    this.renderMessages();

    this.refreshInterval = setInterval(() => {
      this.refresh().then();
    }, 30000);
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
        onClick={() => commUIInstance?.toggle()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="24px" height="24px" fill="currentColor">
          <path d="M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
