import { h } from "../../utils/dom";

const DIVIDER_COLOR = "#499399";

const SplashDivider = (): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        left: "40px",
        right: "40px",
        top: "132px",
        height: "48px",
        width: "calc(100% - 80px)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 32fr) 30px minmax(0, 68fr)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          marginTop: "38px",
          borderTop: `1px solid ${DIVIDER_COLOR}`,
        }}
      />
      <svg
        viewBox="0 0 30 30"
        width="30"
        height="30"
        style={{
          marginTop: "8px",
          overflow: "visible",
        }}
      >
        <line
          x1="0"
          y1="30"
          x2="30"
          y2="0"
          stroke={DIVIDER_COLOR}
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div
        style={{
          marginTop: "8px",
          borderTop: `1px solid ${DIVIDER_COLOR}`,
        }}
      />
    </div>
  ) as HTMLElement;
};

export default SplashDivider;
