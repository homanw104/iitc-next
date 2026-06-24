import type { LayerChooserPaneController } from "../../../controllers/LayerChooserPaneController.tsx";
import { h } from "../../../utils/dom.ts";

const LayerChooserButton = ({ layerChooserPaneController }: {
  layerChooserPaneController: LayerChooserPaneController,
}): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "var(--iitc-bottom-control-padding, 5px)",
        right: "var(--iitc-right-control-padding, 5px)",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="Layer Chooser"
        onClick={() => layerChooserPaneController.togglePane()}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
};

export default LayerChooserButton;
