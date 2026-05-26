/**
 * Contains functions to create and manipulate portal detail panels.
 */

import { PortalData } from "../types/ingress";
import { h } from "../utils/dom";
import { getTeamColor } from "../utils/color";

let currentPane: HTMLElement | null = null;

/**
 * Hides the current portal detail pane if it exists.
 */
export function hidePortalDetail(): void {
  if (currentPane) {
    currentPane.remove();
    currentPane = null;
  }
}

/**
 * Shows the portal detail pane with information about the specified portal.
 *
 * @param data - The data of the portal to display.
 * @param container - The HTML element where the detail pane will be appended.
 */
export function showPortalDetail(data: PortalData, container: HTMLElement): void {
  hidePortalDetail();

  const teamColor = getTeamColor(data.team);
  const colorHex = teamColor.toCssColorString();

  const ui = (
    <div
      ref={(el: HTMLElement) => (currentPane = el)}
      unselectable={true}
      style={{
        position: "absolute",
        top: "10px",
        left: "10px",
        zIndex: "10020",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        fontFamily: "sans-serif",
        padding: "10px",
        borderRadius: "5px",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
        border: `1px solid ${colorHex}`,
        width: "250px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", color: colorHex }}>{data.title || "Unknown Portal"}</h3>
        <button
          onClick={hidePortalDetail}
          style={{
            background: "none",
            border: "none",
            color: "#aaa",
            cursor: "pointer",
            fontSize: "18px",
            padding: "0 5px",
            lineHeight: "1",
          }}
        >
          ×
        </button>
      </div>

      {data.image && (
        <img
          src={data.image}
          alt={data.title || "Unknown Portal"}
          style={{
            width: "100%",
            aspectRatio: "1/1",
            objectFit: "contain",
            borderRadius: "3px",
            marginBottom: "10px",
            display: "block",
          }}
        />
      )}

      <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
        <div><strong>Team:</strong> {data.team}</div>
        <div><strong>Level:</strong> {data.level || "0"}</div>
        {data.health !== undefined && <div><strong>Health:</strong> {data.health}%</div>}
        {data.resCount !== undefined && <div><strong>Resonators:</strong> {data.resCount}</div>}
        <div><strong>Lat:</strong> {(data.latE6 / 1e6).toFixed(6)}</div>
        <div><strong>Lng:</strong> {(data.lngE6 / 1e6).toFixed(6)}</div>
      </div>

      <div style={{ marginTop: "10px", borderTop: "1px solid #555", paddingTop: "5px" }}>
        <a
          href={`https://intel.ingress.com/?pll=${data.latE6 / 1e6},${data.lngE6 / 1e6}`}
          target="_blank"
          style={{ color: "#5091ff", fontSize: "11px", textDecoration: "none" }}
        >
          Intel Map
        </a>
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
