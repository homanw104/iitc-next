import { h } from "../../../utils/dom.ts";
import { PortalData } from "../../../types/ingress.ts";

const PortalMods = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", justifyContent: "flex-start", gap: "4px" }}>
      {Array.from({ length: 4 }, (_, i) => {
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
            {mod === undefined ? (
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
                }}>
                  Loading
                </div>
              </div>
            ) : mod === null ? (
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
                }}>
                  Empty
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
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export default PortalMods;
