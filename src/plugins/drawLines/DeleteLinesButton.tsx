import { h } from "../../utils/dom.ts";

export const DeleteLinesButton = ({ onClick }: {
  onClick: () => void;
}): HTMLElement => {
  return (
    <button
      type="button"
      title="Delete Lines"
      className="cesium-button cesium-toolbar-button"
      onClick={() => onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
        <path d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z" />
      </svg>
    </button>
  ) as HTMLElement;
};
