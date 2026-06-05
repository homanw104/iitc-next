/**
 * Contains functions to create and manipulate portal detail panels.
 */

import { RESO_LEVEL_ENERGY, PortalData } from "../types/ingress";
import { h, Fragment } from "../utils/dom";
import { getTeamColor } from "../utils/color";

const PortalTitle = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", gap: "8px" }}>
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
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: "8px" }}>
          <div style={{ height: "16px", fontSize: "12px" }}>Owner</div>
          <div style={{ height: "16px", fontSize: "12px", color: teamColorHex }}>{data.team == "NEUTRAL" ? "Unclaimed" : data.owner}</div>
        </div>
      </div>
      <div style={{ fontSize: "40px" }}>{data.level}</div>
    </div>
  </div>
);

const PortalImage = ({ data }: { data: PortalData }) => (
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
);

const PortalMods = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", justifyContent: "flex-start", gap: "4px" }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const mod = data.mods?.[i];
        return (
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
        );
      })}
    </div>
  </div>
);

const PortalResonators = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr 0.3fr 1fr 1.4fr",
      gridColumnGap: "4px",
      gridRowGap: "4px",
      fontSize: "12px",
    }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const idx1 = i * 2;
        const idx2 = i * 2 + 1;
        const r1 = data.resonators?.[idx1];
        const r2 = data.resonators?.[idx2];
        return (
          <Fragment key={i}>
            <div style={{
              textAlign: "left",
              alignContent: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: r1 ? teamColorHex : "#555"
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

            {i === 0 ? (
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
            ) : null}

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
              <div style={{ textAlign: "left" }}>{r2 ? "L" + r2.level : ""}</div>
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
          </Fragment>
        );
      })}
    </div>
  </div>
);

const PortalHistory = ({ data }: { data: PortalData }) => (
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
);

const PortalLink = ({ data, onCopy }: { data: PortalData, onCopy: (link: string) => void }) => (
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
        onclick={() => onCopy(`https://intel.ingress.com/?pll=${data.latE6 / 1e6},${data.lngE6 / 1e6}`)}
        style={{ color: "#5091ff", fontSize: "12px", textDecoration: "none", cursor: "pointer" }}
      >
        Copy intel map link
      </div>
    </div>
  </div>
);

const PortalDetailPane = ({ data, onCopy }: {
  data: PortalData,
  onCopy: (link: string) => void
}) => {
  const teamColor = getTeamColor(data.team);
  const teamColorHex = teamColor.toCssColorString();

  return (
    <div
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
      <PortalTitle data={data} teamColorHex={teamColorHex} />
      <PortalImage data={data} />
      <PortalMods data={data} teamColorHex={teamColorHex} />
      <PortalResonators data={data} teamColorHex={teamColorHex} />
      <PortalHistory data={data} />
      <PortalLink data={data} onCopy={onCopy} />
    </div>
  ) as HTMLElement;
};

export class PortalDetailUI {
  private readonly container: HTMLElement;
  private detailPane: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public toggleDetailPane = (data?: PortalData): void => {
    if (this.detailPane) {
      this.removeDetailPane();
    } else if (data) {
      this.detailPane = this.container.appendChild(PortalDetailPane({ data, onCopy: this.copyIntelLink }))
    }
  };

  public removeDetailPane = () => {
    if (this.detailPane) {
      this.detailPane.remove();
      this.detailPane = null;
    }
  };

  public updateDetailPane = (data: PortalData): void => {
    if (this.detailPane) {
      this.removeDetailPane();
      this.detailPane = this.container.appendChild(PortalDetailPane({ data, onCopy: this.copyIntelLink }))
    }
  };

  private copyIntelLink = async (link: string) => {
    const linkButton = document.getElementById("intel-link");
    if (linkButton) {
      await navigator.clipboard.writeText(link);
      linkButton.innerText = "Copied intel map link";
      linkButton.style.color = "white";
      setTimeout(() => {
        linkButton.innerText = "Copy intel map link";
        linkButton.style.color = "#5091ff";
      }, 2000);
    }
  };
}

export const PortalDetailBar = ({ portalDetailUI, data, msg }: {
  portalDetailUI: PortalDetailUI,
  data?: PortalData,
  msg?: string,
}): HTMLElement => {
  return (
    <div
      onClick={() => portalDetailUI.toggleDetailPane(data)}
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
        border: `1px solid ${data ? getTeamColor(data.team).toCssColorString() : "rgb(68, 68, 68)"}`,
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
        {(data && data.title) || msg || "Loading..."}
      </div>
      <div>
        {data && data.level && "L" + data.level || ""}
      </div>
    </div>
  ) as HTMLElement;
}
