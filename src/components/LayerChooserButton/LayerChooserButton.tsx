import { h } from "../../utils/dom";
import { LayerChooserPaneUI } from "../../interface/LayerChooserPaneUI";

const LayerChooserButton = ({ layerChooserPaneUI }: {
  layerChooserPaneUI: LayerChooserPaneUI,
}): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "5px",
        right: "5px",
        zIndex: "10010",
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "flex-end",
      }}
    >
      <button
        type="button"
        className="cesium-button cesium-toolbar-button"
        title="Layer Chooser"
        onClick={() => layerChooserPaneUI.togglePane()}
      >
        <svg class="cesium-svgPath-svg" viewBox="0 -960 960 960" width="30" height="30" fill="currentColor">
          <path d="M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z" />
        </svg>
      </button>
      <div ref={(el: HTMLElement) => layerChooserPaneUI.setWrapper(el)} />
    </div>
  ) as HTMLElement;
};

export default LayerChooserButton;
