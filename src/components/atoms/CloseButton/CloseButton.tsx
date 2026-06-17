import { h } from "../../../utils/dom.ts";

const CloseButton = ({ onClose }: {
  onClose: () => void,
}) => {
  return (
    <div
      aria-label="Close"
      onClick={() => onClose()}
      style={{ cursor: "pointer", display: "flex" }}
    >
      <svg viewBox="0 -960 960 960" width="24px" height="24px" fill="currentColor">
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
      </svg>
    </div>
  );
};

export default CloseButton;
