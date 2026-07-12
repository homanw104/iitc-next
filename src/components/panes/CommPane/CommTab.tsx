import type { Channel } from "../../../types/common/common.ts";
import { h } from "../../../utils/dom.ts";

const CommTab = ({ id, label, isActive, onClick }: {
  id: Channel;
  label: string;
  isActive: boolean;
  onClick: (tab: Channel) => void;
}) => (
  <button
    id={`comm-tab-${id}`}
    onClick={() => onClick(id)}
    style={{
      background: "none",
      border: "none",
      borderBottom: isActive ? "2px solid #ffce00" : "2px solid rgba(0, 0, 0, 0)",
      fontWeight: isActive ? "bold" : "normal",
      color: "white",
      cursor: "pointer",
      width: "76px",
      padding: "8px 8px 16px 8px",
    }}
  >
    {label}
  </button>
);

export default CommTab;
