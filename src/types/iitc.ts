/**
 * Definitions of the iitc global object and plugin objects.
 */

import type * as Cesium from "cesium";
import type { CommManager } from "../managers/comm/commManager";
import type { EntityPositionManager } from "../managers/entity/entityPositionManager";
import type { EntityTranslucencyManager } from "../managers/entity/entityTranslucencyManager";
import type { FieldEntityManager } from "../managers/entity/fieldEntityManager";
import type { LinkEntityManager } from "../managers/entity/linkEntityManager";
import type { PortalEntityManager } from "../managers/entity/portalEntityManager";
import type { PortalHistoryEntityManager } from "../managers/entity/portalHistoryEntityManager";
import type { PortalLabelEntityManager } from "../managers/entity/portalLabelEntityManager";
import type { PortalOrnamentEntityManager } from "../managers/entity/portalOrnamentEntityManager.ts";
import type { ScoutHistoryEntityManager } from "../managers/entity/scoutHistoryEntityManager";
import type { PlayerInfoManager } from "../managers/game/playerInfoManager.ts";
import type { RedeemManager } from "../managers/game/redeemManager";
import type { ScoreManager } from "../managers/game/scoreManager";
import type { LayerManager } from "../managers/layer/layerManager";
import type { ApiRequestManager } from "../managers/system/apiRequestManager.ts";
import type { InterfaceManager } from "../managers/system/interfaceManager";
import type { LogManager } from "../managers/system/logManager";
import type { PluginManager } from "../managers/system/pluginManager";
import type { LoadingProgressManager } from "../managers/system/loadingProgressManager.ts";
import type { SettingsManager } from "../managers/system/settingsManager";
import type { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";

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
  portalEntityManager?: PortalEntityManager;
  linkEntityManager?: LinkEntityManager;
  fieldEntityManager?: FieldEntityManager;
  portalLabelEntityManager?: PortalLabelEntityManager;
  portalOrnamentEntityManager?: PortalOrnamentEntityManager;
  portalHistoryEntityManager?: PortalHistoryEntityManager;
  scoutHistoryEntityManager?: ScoutHistoryEntityManager;
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
