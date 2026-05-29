import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";
import { CommManager } from "../managers/commManager";
import * as Cesium from "cesium";
import { Viewer } from "cesium";

let commDetailPane: HTMLElement | null = null;
let currentChannel: "all" | "faction" | "alerts" = "all";

export function addCommDetailButton(viewer: Viewer, container: HTMLElement, commManager: CommManager): void {
  const ui = (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "43px",
        zIndex: "10012",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="COMM"
        onClick={() => toggleCommDetailPane(viewer, container, commManager)}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}

function toggleCommDetailPane(viewer: Viewer, container: HTMLElement, commManager: CommManager): void {
  if (commDetailPane) {
    commDetailPane.remove();
    commDetailPane = null;
  } else {
    showCommDetailPane(viewer, container, commManager);
  }
}

async function refreshChannel(viewer: Viewer, commManager: CommManager, channel: "all" | "faction" | "alerts") {
  if (channel === "all") await commManager.requestAll();
  if (channel === "faction") await commManager.requestFaction();
  if (channel === "alerts") await commManager.requestAlerts();

  if (commDetailPane && currentChannel === channel) {
    renderCommMessages(viewer, commManager);
  }
}

function renderCommMessages(viewer: Viewer, commManager: CommManager) {
  const listContainer = document.getElementById("comm-message-list");

  if (!listContainer) {
    return;
  } else {
    listContainer.innerHTML = "";
  }

  commManager.getMessages(currentChannel).forEach((plext) => {
    const dateObj = new Date(plext.timestamp);
    let time = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const item = (
      <div style={{ marginBottom: "4px", fontSize: "12px", borderBottom: "1px solid #444", paddingBottom: "2px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        <span style={{ color: "rgba(214, 254, 250, 0.5)", marginRight: "10px" }} title={dateObj.toLocaleString()}>{time}</span>

        {plext.markup.map(([type, data]) => {
          let color = "white";
          if (data.team === "ENLIGHTENED") color = getTeamColor("ENLIGHTENED").toCssColorString();
          if (data.team === "RESISTANCE") color = getTeamColor("RESISTANCE").toCssColorString();

          if (type === "PLAYER") {
            return <span style={{ color, fontWeight: "bold", marginRight: "3px" }}>{data.plain}</span>;
          } else if (type === "PORTAL") {
            return (
              <span 
                style={{ color: "#bbb", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  if (data.latE6 && data.lngE6) {
                     viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6, 1000),
                      duration: 1.5,
                    });
                  }
                }}
                title={data.plain}
              >
                {data.plain}
              </span>
            );
          } else if (type === "SENDER") {
             return <span style={{ color, fontWeight: "bold", marginRight: "3px" }}>{data.plain}</span>;
          } else if (type === "SECURE") {
             return <span style={{ color: "#f88" }}>{data.plain}</span>;
          }
          return <span style={{ color }}>{data.plain}</span>;
        })}
      </div>
    ) as HTMLElement;

    listContainer.appendChild(item);
  });

  listContainer.scrollTop = listContainer.scrollHeight;
}

function showCommDetailPane(viewer: Viewer, container: HTMLElement, commManager: CommManager): void {
  const pane = (
    <div
      ref={(el: HTMLElement) => (commDetailPane = el)}
      style={{
        position: "absolute",
        bottom: "41px",
        right: "5px",
        margin: "2px 3px",
        width: "400px",
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
      <div style={{ display: "flex", gap: "10px", marginBottom: "8px", borderBottom: "1px solid #555", paddingBottom: "5px" }}>
        <button
          id="comm-tab-all"
          onClick={() => { currentChannel = "all"; renderCommTabs(); refreshChannel(viewer, commManager, "all").then(); }}
          style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "4px 8px" }}
        >
          ALL
        </button>
        <button
          id="comm-tab-faction"
          onClick={() => { currentChannel = "faction"; renderCommTabs(); refreshChannel(viewer, commManager, "faction").then(); }}
          style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "4px 8px" }}
        >
          FACTION
        </button>
        <button
          id="comm-tab-alerts"
          onClick={() => { currentChannel = "alerts"; renderCommTabs(); refreshChannel(viewer, commManager, "alerts").then(); }}
          style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "4px 8px" }}
        >
          ALERTS
        </button>
      </div>
      <div id="comm-message-list" style={{ flex: 1, overflowY: "auto", paddingRight: "5px" }}>
        Loading...
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(pane);

  renderCommTabs();
  refreshChannel(viewer, commManager, currentChannel).then(() => renderCommMessages(viewer, commManager));
}

function renderCommTabs() {
  const tabs = ["all", "faction", "alerts"];
  tabs.forEach(tab => {
    const el = document.getElementById(`comm-tab-${tab}`);
    if (el) {
      el.style.borderBottom = currentChannel === tab ? "2px solid #ffce00" : "2px solid rgba(0, 0, 0, 0)";
      el.style.fontWeight = currentChannel === tab ? "bold" : "normal";
    }
  });
}
