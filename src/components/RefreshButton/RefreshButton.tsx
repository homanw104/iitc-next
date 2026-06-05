/**
 * Functions that add a refresh button that refresh tiles in the current view on click.
 */

import { h } from "../../utils/dom";
import { RefreshPaneUI } from "../../interface/RefreshPaneUI";

const RefreshButton = ({ refreshPaneUI }: {
  refreshPaneUI: RefreshPaneUI,
}): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "81px",
        zIndex: "10012",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="Layer Chooser"
        onClick={() => refreshPaneUI.refreshView()}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
}

export default RefreshButton;
