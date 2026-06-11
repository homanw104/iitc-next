import * as Cesium from "cesium";
import { Viewer } from "cesium";
import { h } from "../../utils/dom";
import { getTeamColor } from "../../utils/color";
import { Plext } from "../../managers/commManager";
import { Channel } from "../../types/ingress";

const CommMessage = ({ plext, viewer, channel }: {
  plext: Plext;
  viewer: Viewer;
  channel: Channel;
}) => {
  const dateObj = new Date(plext.timestamp);
  let timeStr: string;
  if (dateObj.toDateString() === new Date(Date.now()).toDateString()) {
    timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    timeStr = dateObj.toLocaleDateString([], { day: "numeric", month: "short" });
  }

  return (
    <div style={{ margin: "4px 0px", display: "flex", flexDirection: "row" }}>
      <div
        style={{ fontSize: "12px", color: "rgba(214, 254, 250, 0.5)", minWidth: "75px", width: "75px" }}
        title={dateObj.toLocaleString()}
      >
        {timeStr}
      </div>
      <div style={{ fontSize: "12px", paddingBottom: "2px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {plext.markup.map(([type, data]) => {
          let color = "white";
          if (data.team === "ENLIGHTENED") color = getTeamColor("ENLIGHTENED").toCssColorString();
          else if (data.team === "RESISTANCE") color = getTeamColor("RESISTANCE").toCssColorString();
          else if (data.team === "MACHINA") color = getTeamColor("MACHINA").toCssColorString();
          else if (data.team === "NEUTRAL" && data.plain === "_̶̱̍_̴̳͉̆̈́M̷͔̤͒Ą̷̍C̴̼̕ͅH̶̹͕̼̾Ḭ̵̇̾̓N̵̺͕͒̀̍Ä̴̞̰́_̴̦̀͆̓_̷̣̈́") color = getTeamColor("MACHINA").toCssColorString();

          if (type === "PLAYER" || type === "SENDER") {
            return <span style={{ color, fontWeight: "bold", marginRight: "3px" }}>{data.plain}</span>;
          } else if (type === "PORTAL") {
            return (
              <span
                style={{ color: "#bbb", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => {
                  if (data.latE6 && data.lngE6) {
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(data.lngE6 / 1e6, data.latE6 / 1e6, 6e2),
                      duration: 1.5,
                    });
                  }
                }}
              >
                {data.plain}
              </span>
            );
          } else if (type === "SECURE") {
            if (channel === "all") {
              return <span style={{ color: "#f88" }}>{data.plain}</span>;
            } else {
              return;
            }
          } else {
            return <span style={{ color: color }}>{data.plain}</span>;
          }
        })}
      </div>
    </div>
  );
};

export default CommMessage;
