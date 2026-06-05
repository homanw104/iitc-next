import { h } from "../../utils/dom";

const CommSendButton = ({ onClick, onRef }: {
  onClick: () => void;
  onRef?: (el: HTMLButtonElement) => void;
}) => (
  <button
    ref={onRef}
    type="button"
    onclick={onClick}
    style={{
      backgroundColor: "#5091ff",
      border: "1px solid #555",
      color: "white",
      height: "34px",
      padding: "4px 8px",
      borderRadius: "2px",
      fontFamily: "coda_regular, arial, helvetica, sans-serif",
      cursor: "pointer",
    }}
  >
    Send
  </button>
);

export default CommSendButton;
