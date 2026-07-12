import type * as Cesium from "cesium";
import type { CommManager } from "../../managers/comm/commManager.ts";
import type { EntityPositionManager } from "../../managers/entity/entityPositionManager.ts";
import type { EntityTranslucencyManager } from "../../managers/entity/entityTranslucencyManager.ts";
import type { FieldManager } from "../../managers/entity/fieldManager.ts";
import type { LinkManager } from "../../managers/entity/linkManager.ts";
import type { PortalManager } from "../../managers/entity/portalManager.ts";
import type { PortalHistoryManager } from "../../managers/entity/portalHistoryManager.ts";
import type { PortalLabelManager } from "../../managers/entity/portalLabelManager.ts";
import type { PortalOrnamentManager } from "../../managers/entity/portalOrnamentManager.ts";
import type { ScoutHistoryManager } from "../../managers/entity/scoutHistoryManager.ts";
import type { UserLocationManager } from "../../managers/entity/userLocationManager.ts";
import type { PlayerInfoManager } from "../../managers/game/playerInfoManager.ts";
import type { RedeemManager } from "../../managers/game/redeemManager.ts";
import type { ScoreManager } from "../../managers/game/scoreManager.ts";
import type { LayerManager } from "../../managers/layer/layerManager.ts";
import type { ApiRequestManager } from "../../managers/system/apiRequestManager.ts";
import type { InterfaceManager } from "../../managers/system/interfaceManager.ts";
import type { LogManager } from "../../managers/system/logManager.ts";
import type { PluginManager } from "../../managers/system/pluginManager.ts";
import type { LoadingProgressManager } from "../../managers/system/loadingProgressManager.ts";
import type { SettingsManager } from "../../managers/system/settingsManager.ts";
import type { TileRequestManager } from "../../managers/tiles/tileRequestManager.ts";

export interface IITCPlugin {
  id: string;
  name: string;
  description: string;
  init: () => void;
  deinit?: () => void;
}

export interface IITCCore {
  viewer?: Cesium.Viewer;
  logManager?: LogManager;
  apiRequestManager?: ApiRequestManager;
  settingsManager?: SettingsManager;
  pluginManager?: PluginManager;
  layerManager?: LayerManager;
  loadingProgressManager?: LoadingProgressManager;
  entityPositionManager?: EntityPositionManager;
  entityTranslucencyManager?: EntityTranslucencyManager;
  playerInfoManager?: PlayerInfoManager;
  portalManager?: PortalManager;
  linkManager?: LinkManager;
  fieldManager?: FieldManager;
  portalLabelManager?: PortalLabelManager;
  portalOrnamentManager?: PortalOrnamentManager;
  portalHistoryManager?: PortalHistoryManager;
  scoutHistoryManager?: ScoutHistoryManager;
  userLocationManager?: UserLocationManager;
  tileRequestManager?: TileRequestManager;
  scoreManager?: ScoreManager;
  redeemManager?: RedeemManager;
  commManager?: CommManager;
  interfaceManager?: InterfaceManager;
}

declare global {
  interface Window {
    iitc: IITCCore;
  }
}
