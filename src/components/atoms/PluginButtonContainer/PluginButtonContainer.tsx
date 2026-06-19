import { h } from "../../../utils/dom.ts";

const PluginButtonContainer = () => {
  return (
    <div
      className="plugin-button-container"
      no-scroll-bar={true}
      style={{
        position: "absolute",
        left: "5px",
        top: "43px",
        bottom: "43px",
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
        zIndex: "10010",
      }}
    />
  ) as HTMLElement;
};

export default PluginButtonContainer;
