import { h } from "../../utils/dom.ts";

export const ImportLinesButton = ({ onClick }: {
  onClick: () => void;
}): HTMLElement => {
  return (
    <button
      type="button"
      title="Import Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M440-200h80v-167l64 64 56-57-160-160-160 160 57 56 63-63v167ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z" />
      </svg>
    </button>
  ) as HTMLElement;
};
