/**
 * Highlight player portal plugin for IITC Next
 *
 * Deprecated. No portal owner info is available until requested, so it's useless.
 *
 * This plugin will highlight the portals with the player
 * who owns or has resonators on them.
 */

import * as Cesium from "cesium";
import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { safeWindow } from "../utils/window";
import { h } from "../utils/dom";

const LAYER_NAME = "Player Portal";
const BUTTON_ID = "player-portal-button";

class HighlightPlayerPortal {
  public id = "highlight-player-portal";
  public name = "Highlight Player Portal";
  public description = "Highlight the portals with the player who owns or has resonators on them.";

  private viewer: IITCCore["viewer"];
  private logManager: IITCCore["logManager"];
  private layerManager: IITCCore["layerManager"];
  private interfaceManager: IITCCore["interfaceManager"];
  private portalEntityManager: IITCCore["portalEntityManager"];

  private source!: Cesium.DataSource;

  public init(): void {
    if (safeWindow) {
      const iitc: IITCCore = safeWindow.iitc;
      this.viewer = iitc.viewer;
      this.logManager = iitc.logManager;
      this.layerManager = iitc.layerManager;
      this.interfaceManager = iitc.interfaceManager;
      this.portalEntityManager = iitc.portalEntityManager;
    }

    if (
      !this.viewer
      || !this.logManager
      || !this.layerManager
      || !this.interfaceManager
      || !this.portalEntityManager
    ) {
      console.warn("[WARN][SamplePlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        interfaceManager: !!this.interfaceManager,
        portalEntityManager: !!this.portalEntityManager,
      });
      return;
    }

    const container: HTMLElement = this.interfaceManager.getContainer();
    this.interfaceManager.mountSidebarButton(
      PlayerSelectorButton({ container, onConfirm: (playerName: string) => this.renderPlayerPortal(playerName) })
    );
    this.source = this.layerManager.getOrCreateSourceAndFilter(LAYER_NAME);
  }

  public deinit(): void {
    if (!this.interfaceManager || !this.layerManager) return;
    this.interfaceManager.unmountSidebarButton(BUTTON_ID);
    this.layerManager.removeSourceAndFilter(LAYER_NAME);
  }

  private renderPlayerPortal(playerName: string): void {
    if (!this.portalEntityManager) return;
    const portals = this.portalEntityManager.getAllPortalData();
    this.source.entities.removeAll();
    portals.forEach(portal => {
      if (portal.owner === playerName || portal.resonators?.some(r => r?.owner === playerName)) {
        console.log("portal", portal);
        this.source.entities.add({
          id: `player-portal-${portal.guid}`,
          position: Cesium.Cartesian3.fromDegrees(portal.lngE6 / 1e6, portal.latE6 / 1e6),
          point: {
            pixelSize: 32,
            scaleByDistance: new Cesium.NearFarScalar(1e1, 1.0, 2e4, 0.125),
            color: Cesium.Color.fromCssColorString("#ffd200"),
          },
        });
      }
    });
  }
}

const PlayerSelectorButton = ({ container, onConfirm }: {
  container: HTMLElement;
  onConfirm: (playerName: string) => void;
}) => {
  const playerSelectorUI: PlayerSelectorUI = new PlayerSelectorUI(container, onConfirm);

  return (
    <div id={BUTTON_ID}>
      <button
        type="button"
        title="COMM"
        className="cesium-button cesium-toolbar-button"
        onClick={() => playerSelectorUI.togglePane()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
          <path d="M664-121q-8-2-15-7l-120-70q-14-8-21.5-21.5T500-249v-141q0-16 7.5-29.5T529-441l120-70q7-5 15-7t16-2q8 0 15.5 2.5T710-511l120 70q14 8 22 21.5t8 29.5v141q0 16-8 29.5T830-198l-120 70q-7 4-14.5 6.5T680-119q-8 0-16-2ZM287-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM80-160v-112q0-33 17-62t47-44q51-26 115-44t141-18h14q6 0 12 2-8 18-13.5 37.5T404-360h-4q-71 0-127.5 18T180-306q-9 5-14.5 14t-5.5 20v32h252q6 21 16 41.5t22 38.5H80Zm376.5-423.5Q480-607 480-640t-23.5-56.5Q433-720 400-720t-56.5 23.5Q320-673 320-640t23.5 56.5Q367-560 400-560t56.5-23.5ZM400-640Zm12 400Zm174-166 94 55 94-55-94-54-94 54Zm124 208 90-52v-110l-90 53v109Zm-150-52 90 53v-109l-90-53v109Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
}

const PlayerSelectorPane = ({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (playerName: string) => void;
}) => {
  let inputValue: string = "";
  let playerName: string = "";

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
        width: "300px",
        height: "100px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 32px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
      }}>
        <div style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          fontSize: "14px",
          marginRight: "42px",
        }}>
          Confirm player name
        </div>
        <form
          onSubmit={(e: Event) => e.preventDefault()}
          style={{
            position: "absolute",
            bottom: "12px",
            left: "12px",
            display: "flex",
            gap: "8px",
            width: "100%",
            maxWidth: "calc(100% - 24px)"
          }}
        >
          <PlayerSelectionTextInput
            value={playerName}
            onChange={(value: string) => {
              inputValue = value;
            }}
            onConfirm={() => {
              playerName = inputValue;
              onConfirm(playerName);
              onClose();
            }}
          />
          <PlayerSelectionConfirmButton
            onClick={() => {
              playerName = inputValue;
              onConfirm(playerName);
              onClose();
            }}
          />
        </form>
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

const PlayerSelectionTextInput = ({ value, onChange, onConfirm }: {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) => {
  return (
    <input
      id="player-selection-input"
      type="text"
      value={value}
      style={{
        flex: 1,
        backgroundColor: "#111",
        border: "1px solid #555",
        color: "white",
        padding: "4px 8px",
        borderRadius: "2px",
      }}
      onChange={(e: Event) => {
        const input = e.target as HTMLInputElement;
        onChange(input.value);
      }}
      onKeyPress={(e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onConfirm();
        }
      }}
    />
  ) as HTMLElement;
}

const PlayerSelectionConfirmButton = ({ onClick }: {
  onClick: () => void
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
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
    >
      Confirm
    </button>
  ) as HTMLElement;
}

class PlayerSelectorUI {
  private container: HTMLElement;
  private pane: HTMLElement | null = null;
  private readonly onConfirm: (playerName: string) => void;

  constructor(container: HTMLElement, onConfirm: (playerName: string) => void) {
    this.container = container;
    this.onConfirm = onConfirm;
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
    }
  }

  private showPane(): void {
    this.pane = PlayerSelectorPane(
      { onClose: () => this.closePane(), onConfirm: (playerName: string) => this.onConfirm(playerName) }
    );
    this.container.appendChild(this.pane);
  }
}

const register = () => {
  if (safeWindow && safeWindow.iitc && safeWindow.iitc.pluginManager) {
    safeWindow.iitc.pluginManager.registerPlugin(new HighlightPlayerPortal());
  } else {
    setTimeout(register, 3000);
  }
};

register();
