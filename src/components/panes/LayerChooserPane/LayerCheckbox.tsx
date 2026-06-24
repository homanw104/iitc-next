import { h } from "../../../utils/dom.ts";
import { LayerManager } from "../../../managers/layer/layerManager.ts";

const LayerCheckbox = ({ id, label, layerManager, onToggle, indent = 0 }: {
  id: string;
  label: string;
  layerManager: LayerManager;
  onToggle: (id: string, checked: boolean) => void;
  indent?: number;
}) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      marginBottom: "4px",
      cursor: "pointer",
      whiteSpace: "nowrap",
      paddingLeft: `${indent * 16}px`,
    }}
  >
    <input
      type="checkbox"
      checked={layerManager.isFilterEnabled(id)}
      indeterminate={layerManager.isFilterIndeterminate(id)}
      style={{ marginRight: "8px" }}
      data-layer-id={id}
      onChange={(e: Event) => onToggle(id, (e.target as HTMLInputElement).checked)}
    />
    {label}
  </label>
);

export default LayerCheckbox;
