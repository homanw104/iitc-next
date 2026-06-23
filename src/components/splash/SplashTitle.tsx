import { h } from "../../utils/dom.ts";

const SplashTitle = (): HTMLElement => {
  return (
    <div
      style={{
        marginBottom: "40px",
        flexShrink: 0,
        fontSize: "48px",
        fontWeight: "700",
        fontFamily: "Open Sans, sans-serif",
        whiteSpace: "nowrap",
        color: "#eeff77",
      }}
    >
      IITC Next
    </div>
  ) as HTMLElement;
};

export default SplashTitle;
