/**
 * Contains functions to create and manipulate portal detail panels.
 */

import { PortalData } from "../types/ingress";
import { h, Fragment } from "../utils/dom";
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
  // Hide any existing portal detail pane before showing the new one
  hidePortalDetail();

  const teamColor = getTeamColor(data.team);
  const teamColorHex = teamColor.toCssColorString();

  const ui = (
    <div style={{
      position: "absolute",
      left: "5px",
      top: "5px",
      bottom: "5px",
      margin: "3px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
    }}>
      <div
        ref={(el: HTMLElement) => (currentPane = el)}
        unselectable={true}
        style={{
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          zIndex: "10020",
          backgroundColor: "rgba(42, 42, 42, 0.9)",
          color: "white",
          fontFamily: "sans-serif",
          borderRadius: "4.2px",
          boxShadow: "0 0 10px rgba(0,0,0,0.5)",
          border: `1px solid ${teamColorHex}`,
          width: "300px",
        }}
      >
        <div style={{ alignSelf: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display:"flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: "8px"}}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", height: "24px", fontSize: "16px" }}>
                {data.title || "Loading..."}
              </div>
              <div style={{ display:"flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "8px" }}>
                <div style={{ height: "16px", fontSize: "12px"}}>Owner</div>
                <div style={{ height: "16px", fontSize: "12px", color: teamColorHex }}>{data.owner || "Unclaimed"}</div>
              </div>
            </div>
            <div style={{ fontSize: "40px" }}>{data.level}</div>
          </div>
        </div>

        <div style={{ alignSelf: "stretch" }}>
          {data.image && (
            <div style={{
              backgroundColor: "rgba(96, 96, 96, 0.9)",
              borderRadius: "4.2px",
            }}>
              <img
                src={data.image}
                alt={data.title || "Loading..."}
                style={{
                  width: "calc(100% - 16px)",
                  aspectRatio: "1/1",
                  padding: "8px",
                  objectFit: "contain",
                  borderRadius: "4.2px",
                  display: "block",
                }}
              />
            </div>
          )}
        </div>

        <div style={{ alignSelf: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", justifyContent: "flex-start", gap: "5px" }}>
            {data.mods && data.mods.map((mod, i) => (
              <div
                key={i}
                style={{
                  fontSize: "10px",
                  padding: "2px",
                  backgroundColor: "#333",
                  borderRadius: "2px",
                  border: mod ? "1px solid #555" : "1px dashed #444",
                }}
              >
                {mod ? (
                  <>
                    <div style={{ fontWeight: "bold" }}>{mod.name}</div>
                    <div style={{ color: "#aaa" }}>{mod.rarity}</div>
                    <div style={{ fontSize: "9px", color: "#888" }}>{mod.owner}</div>
                  </>
                ) : (
                  <div style={{ color: "#555" }}>Empty</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
          <div><strong>Level:</strong> {data.level || "0"}</div>
          {data.health !== undefined && <div><strong>Health:</strong> {data.health}%</div>}
          {data.resCount !== undefined && <div><strong>Resonators:</strong> {data.resCount}</div>}
          <div><strong>Lat:</strong> {(data.latE6 / 1e6).toFixed(6)}</div>
          <div><strong>Lng:</strong> {(data.lngE6 / 1e6).toFixed(6)}</div>
        </div>

        {data.history && (
          <div style={{ fontSize: "11px", marginTop: "10px", color: "#ccc" }}>
            <div>
              <strong>History:</strong> {data.history.visited ? "✅ Visited" : "❌ Not Visited"} |{" "}
              {data.history.captured ? "✅ Captured" : "❌ Not Captured"}
            </div>
            <div>
              <strong>Scout Controlled:</strong> {data.history.scoutControlled ? "✅ Yes" : "❌ No"}
            </div>
          </div>
        )}

        {data.resonators && data.resonators.some((r) => r !== null) && (
          <div style={{ marginTop: "10px", borderTop: "1px solid #555", paddingTop: "5px" }}>
            <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "3px" }}>Resonators:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px" }}>
              {data.resonators.map((res, i) => (
                <div key={i} style={{ fontSize: "10px", color: res ? "inherit" : "#555" }}>
                  {i + 1}: {res ? `L${res.level} - ${res.owner}` : "Empty"}
                </div>
              ))}
            </div>
          </div>
        )}

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
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
