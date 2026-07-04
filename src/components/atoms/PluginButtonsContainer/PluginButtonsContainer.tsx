import { h } from "../../../utils/dom.ts";

const PluginButtonsContainer = () => {
  return (
    <div
      className="plugin-button-container"
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
        top: "calc(var(--iitc-system-top-inset, 0px) + 43px)",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
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
