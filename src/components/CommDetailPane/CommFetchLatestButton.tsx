import { h } from "../../utils/dom";

const CommFetchLatestButton = ({ onRef, onClick, isLoading }: {
  onRef?: (el: HTMLElement) => void;
  onClick: () => void;
  isLoading: boolean;
}) => (
  <button
    ref={onRef}
    onClick={() => onClick()}
    disabled={isLoading}
    style={{
      border: "none",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "14px",
      padding: "16px 0px",
      color: "rgba(214, 254, 250, 0.5)",
      fontFamily: "coda_regular, arial, helvetica, sans-serif",
      textDecoration: isLoading ? "none" : "underline",
      cursor: isLoading ? "default" : "pointer",
    }}
  >
    {isLoading ? "Loading..." : "Fetch latest messages"}
  </button>
);

export default CommFetchLatestButton;
