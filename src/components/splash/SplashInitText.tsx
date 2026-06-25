import { h } from "../../utils/dom.ts";

const SplashInitText = ({ ref }: {
  ref?: (el: HTMLElement) => void,
}): HTMLElement => {
  return (
    <pre
      ref={ref}
      style={{
        marginTop: "60px",
        minHeight: "37.8px",
        color: "#59fbea",
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {"Initializing..."}
    </pre>
  ) as HTMLElement;
};

export default SplashInitText;
