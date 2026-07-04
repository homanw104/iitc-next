import type { LayerManager } from "../../../managers/layer/layerManager.ts";
import { TEAMS } from "../../../types/ingress.ts";
import { h } from "../../../utils/dom.ts";
import LayerCheckbox from "./LayerCheckbox.tsx";
import LayerSection from "./LayerSection.tsx";

const LayerChooserPane = ({ layerManager, onToggle }: {
  layerManager: LayerManager;
  onToggle: (id: string, checked: boolean) => void;
}): HTMLElement => {
  const pluginFilters = layerManager.getPluginFilters();

  return (
    <div
      style={{
        position: "absolute",
        right: "calc(var(--iitc-system-right-inset, 0px) + 5px)",
        margin: "2px 3px",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "6px",
        width: "150px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 30px)",
        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding - 2 * button - 2 * margin compensate
        maxHeight: "calc(100% - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 104px)",

        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        fontFamily: "sans-serif",
        fontSize: "12px",
        overflowY: "auto",
        zIndex: "10024",
      }}
    >
      <LayerSection name="Factions" />
      {TEAMS.map((team) => (
        <LayerCheckbox
          label={team}
          id={`team-${team.toLowerCase()}`}
          layerManager={layerManager}
          onToggle={onToggle}
        />
      ))}

      <LayerSection name="Entities" />
      <LayerCheckbox label="Portals" id="portals" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Labels" id="portals-label" layerManager={layerManager} onToggle={onToggle} indent={1} />
      <LayerCheckbox label="Ornaments" id="portals-ornament" layerManager={layerManager} onToggle={onToggle} indent={1} />
      <LayerCheckbox label="Placeholders" id="portals-placeholder" layerManager={layerManager} onToggle={onToggle} indent={1} />
      {Array.from({ length: 8 }, (_, i) => (
        <LayerCheckbox
          label={`Level ${i + 1}`}
          id={`level-${i + 1}`}
          layerManager={layerManager}
          onToggle={onToggle}
          indent={1}
        />
      ))}
      <LayerCheckbox label="Links" id="links" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Fields" id="fields" layerManager={layerManager} onToggle={onToggle} />

      <LayerSection name="History" />
      <LayerCheckbox label="Visited/Captured" id="history" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Scout Controlled" id="scout-control" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Not Visited/Captured" id="history-reverse" layerManager={layerManager} onToggle={onToggle} />
      <LayerCheckbox label="Not Scout Controlled" id="scout-control-reverse" layerManager={layerManager} onToggle={onToggle} />

      <LayerSection name="Debug" />
      <LayerCheckbox label="Debug Tiles" id="debug-tiles" layerManager={layerManager} onToggle={onToggle} />

      {pluginFilters.length > 0 && <LayerSection name="Plugins" />}
      {pluginFilters.map(([id]) => (
        <LayerCheckbox label={id} id={id} layerManager={layerManager} onToggle={onToggle} />
      ))}
    </div>
  ) as HTMLElement;
};

export default LayerChooserPane;
