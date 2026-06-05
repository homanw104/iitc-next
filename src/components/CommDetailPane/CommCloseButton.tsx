import { h } from "../../utils/dom";

const CommCloseButton = ({ onRef, onClick }: {
  onRef?: (el: HTMLElement) => void;
  onClick: () => void;
}) => (
  <button
    ref={onRef}
    onclick={() => onClick()}
    type="button"
    style={{
      padding: "0px",
      border: "none",
      backgroundColor: "rgba(0, 0, 0, 0)",
      color: "white",
      cursor: "pointer",
    }}
  >
    <svg viewBox="0 -960 960 960" width="24px" height="24px" fill="currentColor">
      <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  </button>
);

export default CommCloseButton;
