import { h } from "../../../utils/dom.ts";
import RightArrowIcon from "./RightArrowIcon.tsx";

const SettingsItem = ({
  title,
  description,
  onClick,
}: {
  title: string,
  description: string,
  onClick: () => void,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px",
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderRadius: "4px",
      cursor: "pointer",
    }}
    onClick={onClick}
  >
    <div>
      <div style={{ fontWeight: "bold" }}>{title}</div>
      <div style={{ fontSize: "12px", color: "#aaa" }}>{description}</div>
    </div>
    <RightArrowIcon />
  </div>
) as HTMLElement;

export default SettingsItem;
