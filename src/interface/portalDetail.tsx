/**
 * Contains functions to create and manipulate portal detail panels.
 */

import { RESO_LEVEL_ENERGY, PortalData } from "../types/ingress";
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
      right: "5px",
      margin: "3px",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      pointerEvents: "none",
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
          boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
          border: `1px solid ${teamColorHex}`,
          width: "350px",
          maxWidth: "calc(100% - 24px)",
          maxHeight: "100%",
          pointerEvents: "auto",
        }}
      >
        {/* Title */}
        <div style={{ alignSelf: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display:"flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: "8px"}}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", height: "24px", fontSize: "16px" }}>
                {data.title || "Loading..."}
              </div>
              <div style={{ display:"flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "8px" }}>
                <div style={{ height: "16px", fontSize: "12px"}}>Owner</div>
                <div style={{ height: "16px", fontSize: "12px", color: teamColorHex }}>{data.team == "NEUTRAL" ? "Unclaimed" : data.owner}</div>
              </div>
            </div>
            <div style={{ fontSize: "40px" }}>{data.level}</div>
          </div>
        </div>

        {/* Image */}
        <div style={{ alignSelf: "stretch" }}>
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
        </div>

        {/* Mods */}
        <div style={{ alignSelf: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", justifyContent: "flex-start", gap: "4px" }}>
            {(() => {
              const items = [];
              for (let i = 0; i < 4; i++) {
                const mod = data.mods?.[i];
                items.push(
                  <div
                    key={i}
                    style={{
                      width: "calc(25% - 16px)",
                      aspectRatio: "1/1",
                      padding: "8px",
                      backgroundColor: "#333",
                      borderRadius: "4.2px",
                      border: mod ? "1px solid #555" : "1px dashed #444",
                    }}
                  >
                    {mod ? (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px"
                      }}>
                        <div style={{
                          textAlign: "center",
                          alignContent: "center",
                          fontSize: "12px",
                          fontWeight: "bold",
                          height: "32px",
                          marginBottom: "8px"
                        }}>
                          {mod.name}
                        </div>
                        <div style={{
                          textAlign: "center",
                          fontSize: "10px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#aaa"
                        }}>
                          {mod.rarity}
                        </div>
                        <div style={{
                          textAlign: "center",
                          fontSize: "10px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: teamColorHex
                        }}>
                          {mod.owner}
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px"
                      }}>
                        <div style={{
                          textAlign: "center",
                          alignContent: "center",
                          fontSize: "12px",
                          height: "32px",
                          color: "#555"
                        }}>Empty
                        </div>
                      </div>
                    )}
                  </div>
                )
              }
              return items;
            })()}
          </div>
        </div>

        {/* Resonators */}
        <div style={{ alignSelf: "stretch" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "30% 20% 20% 30%",
            fontSize: "12px"
          }}>
            {(() => {
              const items = [];
              for (let i = 0; i < 8; i = i + 2) {
                const r1 = data.resonators?.[i];
                const r2 = data.resonators?.[i + 1];
                items.push(
                  <>
                    <div style={{ textAlign: "left", alignContent: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: teamColorHex }}>{r1?.owner || ""}</div>
                    <div style={{ padding: "4px", height: "14px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ textAlign: "right" }}>{r1 ? "L" + r1.level : ""}</div>
                      <div style={{ textAlign: "right" }}>{r1 ? Math.round(r1.energy / RESO_LEVEL_ENERGY[r1.level] * 100) + "%" : ""}</div>
                    </div>
                    <div style={{ padding: "4px", height: "14px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ textAlign: "left" }}>{r2 ? Math.round(r2.energy / RESO_LEVEL_ENERGY[r2.level] * 100) + "%" : ""}</div>
                      <div style={{ textAlgin: "left" }}>{r2 ? "L" + r2.level : ""}</div>
                    </div>
                    <div style={{ textAlign: "right", alignContent: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: teamColorHex }}>{r2?.owner || ""}</div>
                  </>
                );
              }
              return items;
            })()}
          </div>
        </div>

        {/* History */}
        <div style={{ alignSelf: "stretch" }}>
          {data.history && (
            <div style={{ paddingTop: "8px", paddingBottom: "8px", fontSize: "12px", color: "#ccc" }}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "stretch" }}>
                <div style={{ marginRight: "8px" }}>
                  <strong>Visited:</strong> {data.history.visited ? "✅" : "❌"}
                </div>
                <div style={{ marginRight: "8px" }}>
                  <strong>Captured:</strong> {data.history.captured ? "✅" : "❌"}
                </div>
                <div style={{ marginRight: "8px" }}>
                  <strong>Scout Controlled:</strong> {data.history.scoutControlled ? "✅" : "❌"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Link */}
        <div style={{ alignSelf: "stretch" }}>
          <div style={{
            borderTop: "1px solid #555",
            paddingTop: "8px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <a
              href={`https://intel.ingress.com/?pll=${data.latE6 / 1e6},${data.lngE6 / 1e6}`}
              target="_blank"
              style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none" }}
            >
              Intel Map Link
            </a>
            <a
              onclick={() => hidePortalDetail()}
              style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none", cursor:"pointer" }}
            >
              Back
            </a>
          </div>
        </div>
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
