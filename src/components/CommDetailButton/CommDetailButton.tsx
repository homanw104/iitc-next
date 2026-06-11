import { h } from "../../utils/dom";
import { CommDetailPaneController } from "../../controllers/CommDetailPaneController.tsx";

const CommDetailButton = ({ commDetailPaneController }: {
  commDetailPaneController: CommDetailPaneController,
}): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "43px",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        title="COMM"
        className="cesium-button cesium-toolbar-button"
        onClick={() => commDetailPaneController.togglePane()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor" style={{ width: "26px", height: "26px", left: "2px", top: "2px", bottom: "2px", right: "2px" }}>
          <path d="M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
};

export default CommDetailButton;
