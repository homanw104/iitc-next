/**
 * Function that adds a layer chooser button and dropdown to the specified container.
 */

import { LayerManager } from "../managers/layerManager";
import { TEAMS } from "../types/ingress";
import { h } from "../utils/dom";

/**
 * Adds a layer chooser button and dropdown to the specified container.
 *
 * @param container - The HTML element where the layer chooser will be appended.
 * @param entityManager - An instance of LayerManager that manages layer visibility.
 */
export function addLayerChooser(container: HTMLElement, entityManager: LayerManager): void {
  let chooser: HTMLElement;

  const onToggleButton = () => {
    chooser.style.display = chooser.style.display === "none" ? "block" : "none";
  };

  const onToggleCheckbox = (id: string, checked: boolean) => {
    entityManager.setFilter(id, checked);
    if (!chooser) return;
    const allCheckboxes = chooser.querySelectorAll("input[type='checkbox']");
    allCheckboxes.forEach((cb) => {
      const layerId = cb.getAttribute("data-layer-id");
      if (layerId) {
        const input = cb as HTMLInputElement;
        input.checked = entityManager.isFilterEnabled(layerId);
        input.indeterminate = entityManager.isFilterIndeterminate(layerId);
      }
    });
  };

  const createCheckbox = (label: string, id: string, indent = 0) => (
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
        checked={entityManager.isFilterEnabled(id)}
        indeterminate={entityManager.isFilterIndeterminate(id)}
        style={{ marginRight: "8px" }}
        data-layer-id={id}
        onChange={(e: any) => onToggleCheckbox(id, e.target.checked)}
      />
      {label}
    </label>
  );

  const createSection = (name: string) => (
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
        onClick={onToggleButton}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z" />
        </svg>
      </button>
      <div
        ref={(el: HTMLElement) => (chooser = el)}
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
          display: "none",
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

        {createSection("Factions")}
        {TEAMS.map((team) => createCheckbox(team, `team-${team.toLowerCase()}`))}

        {createSection("Entities")}
        {createCheckbox("Portals", "portals")}
        {createCheckbox("Placeholders", "portals-placeholder", 1)}
        {Array.from({ length: 8 }, (_, i) =>
          createCheckbox(`Level ${i + 1}`, `level-${i + 1}`, 1))}
        {createCheckbox("Links", "links")}
        {createCheckbox("Fields", "fields")}

        {createSection("History")}
        {createCheckbox("Visited/Captured", "history")}
        {createCheckbox("Scout Controlled", "scout-control")}
        {createCheckbox("Not Visited/Captured", "history-reverse")}
        {createCheckbox("Not Scout Controlled", "scout-control-reverse")}

        {createSection("Debug")}
        {createCheckbox("Debug Tiles", "debug-tiles")}
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
