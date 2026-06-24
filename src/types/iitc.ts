/**
 * Definitions of the iitc global object and plugin objects.
 */

import * as Cesium from "cesium";
import { LogManager } from "../managers/system/logManager";
import { SettingsManager } from "../managers/system/settingsManager";
import { PluginManager } from "../managers/system/pluginManager";
import { LayerManager } from "../managers/layer/layerManager";
import { SceneEventManager } from "../managers/system/sceneEventManager";
import { EntityPositionManager } from "../managers/entity/entityPositionManager";
import { EntityTranslucencyManager } from "../managers/entity/entityTranslucencyManager";
import { PlayerInfoManager } from "../managers/game/playerInfoManager.ts";
import { PortalEntityManager } from "../managers/entity/portalEntityManager";
import { LinkEntityManager } from "../managers/entity/linkEntityManager";
import { FieldEntityManager } from "../managers/entity/fieldEntityManager";
import { PortalLabelEntityManager } from "../managers/entity/portalLabelEntityManager";
import { PortalHistoryEntityManager } from "../managers/entity/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/entity/scoutHistoryEntityManager";
import { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";
import { ScoreManager } from "../managers/game/scoreManager";
import { RedeemManager } from "../managers/game/redeemManager";
import { CommManager } from "../managers/comm/commManager";
import { InterfaceManager } from "../managers/system/interfaceManager";
import { PortalOrnamentEntityManager } from "../managers/entity/portalOrnamentEntityManager.ts";

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
  settingsManager?: SettingsManager;
  pluginManager?: PluginManager;
  layerManager?: LayerManager;
  sceneEventManager?: SceneEventManager;
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
