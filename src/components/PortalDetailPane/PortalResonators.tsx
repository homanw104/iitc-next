import { h, Fragment } from "../../utils/dom";
import { PortalData, RESO_LEVEL_ENERGY } from "../../types/ingress";

const PortalResonators = ({ data, teamColorHex }: { data: PortalData, teamColorHex: string }) => (
  <div style={{ alignSelf: "stretch" }}>
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr 0.3fr 1fr 1.4fr",
      gridColumnGap: "4px",
      gridRowGap: "4px",
      fontSize: "12px",
    }}>
      {Array.from({ length: 4 }, (_, i) => {
        const i1 = i * 2;
        const i2 = i * 2 + 1;
        const r1 = data.resonators === undefined ? undefined : data.resonators[i1] === undefined ? null : data.resonators[i1];
        const r2 = data.resonators === undefined ? undefined : data.resonators[i2] === undefined ? null : data.resonators[i2];
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
              {r1 === undefined ? "unknown" : r1 === null ? "empty slot" : r1.owner}
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

export default PortalResonators;
