import { h } from "../../../utils/dom.ts";

const CommLoadingIndicator = ({ onRef }: {
  onRef: (el: HTMLElement) => void;
}) => (
  <div ref={onRef} style={{ padding: "8px 0px", display: "flex", flexDirection: "row" }}>
    <div style={{ fontSize: "14px", paddingBottom: "2px", color: "rgba(214, 254, 250, 0.5)" }}>Loading...</div>
  </div>
);

export default CommLoadingIndicator;
