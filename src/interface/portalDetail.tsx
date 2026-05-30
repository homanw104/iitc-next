/**
 * Contains functions to create and manipulate portal detail panels.
 */

import { RESO_LEVEL_ENERGY, PortalData } from "../types/ingress";
import { h, Fragment } from "../utils/dom";
import { getTeamColor } from "../utils/color";

let currentDetailBar: HTMLElement | null = null;
let currentDetailPane: HTMLElement | null = null;
let previousPortalData: PortalData | null = null;
let previousMsg: string | null = null;
let copyTextInfoTimeout: ReturnType<typeof setTimeout>;

async function copyIntelLink(link: string) {
  const linkButton = document.getElementById("intel-link");

  if (linkButton) {
    if (copyTextInfoTimeout) clearTimeout(copyTextInfoTimeout);
    await navigator.clipboard.writeText(link);
    linkButton.innerText = "Copied intel map link";
    linkButton.style.color = "white";
    copyTextInfoTimeout = setTimeout(() => {
      linkButton.innerText = "Copy intel map link";
      linkButton.style.color = "#5091ff";
    }, 2000);
  }
}

export function showOrUpdateDetailBar(container: HTMLElement, display?: PortalData | string): void {
  // Clear existing detail bar
  if (currentDetailBar) {
    currentDetailBar.remove();
    currentDetailBar = null;
  }

  // Clear previous portal data if no display object is presented
  if (!display) {
    previousPortalData = null;
    display = previousMsg || "Loading...";
  }

  // Previous portal data takes precedence of the current message
  if (typeof display === "string" && previousPortalData) {
    display = previousPortalData;
  }

  // Update previous data
  if (typeof display === "string") {
    previousMsg = display;
  } else {
    previousPortalData = display;
  }

  // Parse display
  const data = typeof display !== "string" ? display : undefined;
  const msg = typeof display === "string" ? display : undefined;

  // Refresh detail pane as well if displayed
  if (currentDetailPane && data) {
    showOrUpdateDetailPane(container, data);
  } else {
    removeDetailPane();
  }

  // Get team color
  let teamColorHex = "rgb(68, 68, 68)";
  if (data) teamColorHex = getTeamColor(data.team).toCssColorString();

  const ui = (
    <div
      ref={(el: HTMLElement) => (currentDetailBar = el)}
      onclick={() => {
        if (data) toggleDetailPane(container);
      }}
      style={{
        position: "absolute",
        left: "5px",
        bottom: "5px",
        margin: "2px 3px",
        height: "30px",
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px - 114px)",
        paddingLeft: "12px",
        paddingRight: "12px",
        fontSize: "14px",
        zIndex: "10018",
        backgroundColor: "rgb(48, 51, 54)",
        color: "white",
        fontFamily: "sans-serif",
        borderRadius: "4.2px",
        border: `1px solid ${teamColorHex}`,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    >
      <div style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {data && data.title || msg || "Loading portal..." }
      </div>
      <div>
        {data && data.level && "L" + data.level || ""}
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}

export function toggleDetailPane(container: HTMLElement): void {
  if (currentDetailPane) {
    currentDetailPane.remove();
    currentDetailPane = null;
  } else if (previousPortalData) {
    showOrUpdateDetailPane(container, previousPortalData);
  }
}

export function removeDetailPane(): void {
  if (currentDetailPane) {
    currentDetailPane.remove();
    currentDetailPane = null;
  }
}

export function showOrUpdateDetailPane(container: HTMLElement, data: PortalData): void {
  removeDetailPane();

  const teamColor = getTeamColor(data.team);
  const teamColorHex = teamColor.toCssColorString();

  const ui = (
    <div
      ref={(el: HTMLElement) => (currentDetailPane = el)}
      unselectable={true}
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "5px",
        bottom: "calc(5px + 36px + 2px)",
        padding: "12px",
        margin: "2px 3px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "12px",
        zIndex: "10020",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        fontFamily: "sans-serif",
        borderRadius: "4.2px",
        boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
        border: `1px solid ${teamColorHex}`,
        width: "400px",
        maxWidth: "calc(100% - 18px - 24px)",
        maxHeight: "calc(100% - 14px - 36px - 24px - 43px)",
        pointerEvents: "auto",
        overflow: "scroll",
      }}
    >
      {/* Title */}
      <div style={{ alignSelf: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display:"flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: "8px"}}>
            <div style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              height: "24px",
              fontSize: "16px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
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
              aspectRatio: "4/3",
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
          gridTemplateColumns: "1.4fr 1fr 0.3fr 1fr 1.4fr",
          gridColumnGap: "4px",
          gridRowGap: "4px",
          fontSize: "12px",
        }}>
          {(() => {
            const items = [];
            for (let i = 0; i < 8; i = i + 2) {
              const r1 = data.resonators?.[i];
              const r2 = data.resonators?.[i + 1];
              items.push(
                <>
                  <div style={{
                    textAlign: "left",
                    alignContent: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: r2 ? teamColorHex : "#555"
                  }}>
                    {r1?.owner || "empty slot"}
                  </div>
                  <div style={{
                    padding: "8px 6px",
                    height: "16px",
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#333",
                    border: r1 ? "1px solid #555" : "1px dashed #444",
                    borderRadius: "4.2px",
                  }}>
                    <div style={{ textAlign: "right" }}>{r1 ? "L" + r1.level : ""}</div>
                    <div style={{ textAlign: "right" }}>{r1 ? Math.round(r1.energy / RESO_LEVEL_ENERGY[r1.level] * 100) + "%" : ""}</div>
                  </div>
                </>
              );
              if (i === 0) {
                items.push(
                  <div style={{
                    padding: "3px",
                    gridRow: "1 / span 4",
                    gridColumn: "3",
                    display: "flex",
                    flexDirection: "column-reverse",
                    backgroundColor: "#333",
                    border: "1px solid #555",
                    borderRadius: "4.2px",
                  }}>
                    <div style={{
                      height: data.health ? Math.round(data.health / 100 * 100) + "%" : "0%",
                      backgroundColor: teamColorHex,
                    }}>
                    </div>
                  </div>
                )
              }
              items.push(
                <>
                  <div style={{
                    padding: "8px 6px",
                    height: "16px",
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#333",
                    border: r2 ? "1px solid #555" : "1px dashed #444",
                    borderRadius: "4.2px",
                  }}>
                    <div style={{ textAlign: "left" }}>{r2 ? Math.round(r2.energy / RESO_LEVEL_ENERGY[r2.level] * 100) + "%" : ""}</div>
                    <div style={{ textAlgin: "left" }}>{r2 ? "L" + r2.level : ""}</div>
                  </div>
                  <div style={{
                    textAlign: "right",
                    alignContent: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: r2 ? teamColorHex : "#555"
                  }}>
                    {r2?.owner || "empty slot"}
                  </div>
                </>
              );
            }
            return items;
          })()}
        </div>
      </div>

      {/* History */}
      <div style={{ alignSelf: "stretch" }}>
        <div style={{ paddingTop: "8px", paddingBottom: "8px", fontSize: "12px", color: "#ccc" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "stretch" }}>
            <div style={{ marginRight: "8px" }}>
              <strong>Visited:</strong> {data.history?.visited ? "✅" : "❌"}
            </div>
            <div style={{ marginRight: "8px" }}>
              <strong>Captured:</strong> {data.history?.captured ? "✅" : "❌"}
            </div>
            <div style={{ marginRight: "8px" }}>
              <strong>Scout Controlled:</strong> {data.history?.scoutControlled ? "✅" : "❌"}
            </div>
          </div>
        </div>
      </div>

      {/* Link */}
      <div style={{ alignSelf: "stretch" }}>
        <div style={{
          padding: "8px 0px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div
            id="intel-link"
            onclick={() => copyIntelLink(`https://intel.ingress.com/?pll=${data.latE6 / 1e6},${data.lngE6 / 1e6}`)}
            style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none", cursor: "pointer" }}
          >
            Copy intel map link
          </div>
        </div>
      </div>
    </div>
  ) as HTMLElement;

  container.appendChild(ui);
}
