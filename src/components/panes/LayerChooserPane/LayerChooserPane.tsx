import { h } from "../../../utils/dom.ts";
import { TEAMS } from "../../../types/ingress.ts";
import { LayerManager } from "../../../managers/layerManager.ts";
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
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        position: "absolute",
        right: "5px",
        bottom: "41px",
        margin: "2px 3px",
        padding: "6px",
        borderRadius: "4.2px",
        color: "white",
        fontFamily: "sans-serif",
        fontSize: "12px",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
        border: "1px solid #555",
        minWidth: "150px",
        maxHeight: "calc(100% - 104px)",
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
