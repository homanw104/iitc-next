import { h } from "../../../utils/dom.ts";

const PluginButtonsContainer = () => {
  return (
    <div
      className="plugin-button-container"
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "var(--iitc-left-control-padding, 5px)",
        top: "calc(var(--iitc-top-control-padding, 5px) + 38px)",
        bottom: "calc(var(--iitc-bottom-control-padding, 5px) + 38px)",
        paddingTop: "38px",
        width: "38px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "2px",
        overflowY: "auto",
        overflowX: "hidden",
        flexShrink: 0,
        minHeight: 0,
      }}
    />
  ) as HTMLElement;
};

export default PluginButtonsContainer;
