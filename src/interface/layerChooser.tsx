/**
 * Function that adds a layer chooser button and dropdown to the specified container.
 */

import { LayerManager } from "../managers/layerManager";
import { TEAMS } from "../types/ingress";
import { h } from "../utils/dom";

const LayerCheckbox = ({ label, id, layerManager, onToggle, indent = 0 }: {
  label: string;
  id: string;
  layerManager: LayerManager;
  onToggle: (id: string, checked: boolean) => void;
  indent?: number;
}) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      marginBottom: "4px",
      cursor: "pointer",
      whiteSpace: "nowrap",
      paddingLeft: `${indent * 16}px`,
    }}
  >
    <input
      type="checkbox"
      checked={layerManager.isFilterEnabled(id)}
      indeterminate={layerManager.isFilterIndeterminate(id)}
      style={{ marginRight: "8px" }}
      data-layer-id={id}
      onChange={(e: any) => onToggle(id, e.target.checked)}
    />
    {label}
  </label>
);

const LayerSection = ({ name }: { name: string }) => (
  <div
    style={{
      marginTop: "10px",
      marginBottom: "5px",
      fontWeight: "bold",
      fontSize: "10px",
      color: "#aaa",
      textTransform: "uppercase",
      letterSpacing: "1px",
    }}
  >
    {name}
  </div>
);

const LayerChooserPane = ({ layerManager, onToggle }: {
  layerManager: LayerManager;
  onToggle: (id: string, checked: boolean) => void;
}) => {
  return (
    <div
      style={{
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        padding: "6px",
        margin: "3px",
        borderRadius: "4.2px",
        color: "white",
        fontFamily: "sans-serif",
        fontSize: "12px",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
        border: "1px solid #555",
        minWidth: "150px",
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          marginBottom: "8px",
          borderBottom: "1px solid #555",
          paddingBottom: "4px",
        }}
      >
        Layers
      </div>

      <LayerSection name="Factions" />
      {TEAMS.map((team) => (
        <LayerCheckbox
          label={team}
          id={`team-${team.toLowerCase()}`}
          layerManager={layerManager}
          onToggle={onToggle}
        />
      ))}

      <LayerSection name="Entities" />
      <LayerCheckbox label="Portals" id="portals" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Placeholders" id="portals-placeholder" layerManager={layerManager} onToggle={onToggle} indent={1} />
      {Array.from({ length: 8 }, (_, i) => (
        <LayerCheckbox
          label={`Level ${i + 1}`}
          id={`level-${i + 1}`}
          layerManager={layerManager}
          onToggle={onToggle}
          indent={1}
        />
      ))}
      <LayerCheckbox label="Links" id="links" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Fields" id="fields" layerManager={layerManager} onToggle={onToggle} />

      <LayerSection name="History" />
      <LayerCheckbox label="Visited/Captured" id="history" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Scout Controlled" id="scout-control" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Not Visited/Captured" id="history-reverse" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Not Scout Controlled" id="scout-control-reverse" layerManager={layerManager} onToggle={onToggle} />

      <LayerSection name="Debug" />
      <LayerCheckbox label="Debug Tiles" id="debug-tiles" layerManager={layerManager} onToggle={onToggle} />

      {layerManager.pluginFilterStates.size > 0 && <LayerSection name="Plugins" />}
      {Array.from(layerManager.pluginFilterStates.entries()).map(([id, _]) => (
        <LayerCheckbox label={id} id={id} layerManager={layerManager} onToggle={onToggle} />
      ))}
    </div>
  ) as HTMLElement;
};

class LayerChooserUI {
  private readonly layerManager: LayerManager;
  private pane: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;

  constructor(layerManager: LayerManager) {
    this.layerManager = layerManager;
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
    this.renderPane();
  }

  private renderPane(): void {
    const newPane = (
      <LayerChooserPane
        layerManager={this.layerManager}
        onToggle={this.handleToggle}
      />
    ) as HTMLElement;

    if (this.pane) {
      this.pane.replaceWith(newPane);
    } else {
      if (this.wrapper) {
        this.wrapper.appendChild(newPane);
      }
    }
    this.pane = newPane;
  }

  private handleToggle = (id: string, checked: boolean) => {
    this.layerManager.setFilter(id, checked);
    this.renderPane();
  };

  public setWrapper(el: HTMLElement) {
    this.wrapper = el;
  }
}

/**
 * Adds a layer chooser button and dropdown to the specified container.
 *
 * @param container - The HTML element where the layer chooser will be appended.
 * @param layerManager - An instance of LayerManager that manages layer visibility.
 */
export function addLayerChooserButton(container: HTMLElement, layerManager: LayerManager): void {
  const uiInstance = new LayerChooserUI(layerManager);

  const ui = (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "5px",
        zIndex: "10010",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="Layer Chooser"
        onClick={() => uiInstance.togglePane()}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z" />
        </svg>
      </button>
      <div ref={(el: HTMLElement) => uiInstance.setWrapper(el)} />
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
