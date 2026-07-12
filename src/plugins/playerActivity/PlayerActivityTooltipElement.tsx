import { h } from "../../utils/dom.ts";

export const PlayerActivityTooltipElement = (): HTMLElement => {
  return (
    <div id="cesium-rich-tooltip" style={{
      display: "none",
      position: "absolute",
      backgroundColor: "rgba(42, 42, 42, 0.9)",
      border: "1px solid #555",
      padding: "4px",
      color: "white",
      zIndex: "10500",
    }} />
  ) as HTMLElement;
};
