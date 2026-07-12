import { h } from "../../utils/dom.ts";

export const ClearLinesButton = ({ onClick }: {
  onClick: () => void;
}): HTMLElement => {
  return (
    <button
      type="button"
      title="Clear Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
      </svg>
    </button>
  ) as HTMLElement;
};
