import { h } from "../../utils/dom";

const PluginButtonContainer = () => (
  <div
    className="plugin-button-container"
    style={{
      position: "absolute",
      zIndex: "10010",
      left: "5px",
      top: "41px",
      bottom: "41px",
      paddingTop: "72px",
      width: "38px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "2px",
    }}
  />
) as HTMLElement;

export default PluginButtonContainer;
