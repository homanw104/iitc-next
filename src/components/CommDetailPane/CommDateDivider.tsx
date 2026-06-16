import { h } from "../../utils/dom";

const CommDateDivider = ({ timeStr }: {
  timeStr: string;
}) => (
  <div style={{
    width: "100%",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "stretch"
  }}>
    <div style={{ flexGrow: "1", height: "1px", backgroundColor: "rgba(214, 254, 250, 0.5)" }} />
    <div style={{ width: "60px", fontSize: "12px", textAlign: "center", color: "rgba(214, 254, 250, 0.5)" }}>{timeStr}</div>
    <div style={{ flexGrow: "1", height: "1px", backgroundColor: "rgba(214, 254, 250, 0.5)" }} />
  </div>
);

export default CommDateDivider;
