import { h } from "../../utils/dom.ts";

export const ExportLinesButton = ({ onClick }: {
  onClick: () => void;
}): HTMLElement => {
  return (
    <button
      type="button"
      title="Export Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="m720-120 160-160-56-56-64 64v-167h-80v167l-64-64-56 56 160 160ZM560 0v-80h320V0H560ZM240-160q-33 0-56.5-23.5T160-240v-560q0-33 23.5-56.5T240-880h280l240 240v121h-80v-81H480v-200H240v560h240v80H240Zm0-80v-560 560Z" />
      </svg>
    </button>
  ) as HTMLElement;
};
