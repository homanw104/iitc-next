/**
 * Definitions of the iitc global object and plugin objects.
 */

import * as Cesium from "cesium";
import { LogManager } from "../managers/logManager";
import { SettingsManager } from "../managers/settingsManager";
import { PluginManager } from "../managers/pluginManager";
import { LayerManager } from "../managers/layerManager";
import { SceneEventManager } from "../managers/sceneEventManager";
import { EntityPositionManager } from "../managers/entityPositionManager";
import { PlayerInfoManager } from "../managers/playerInfoManager.ts";
import { PortalEntityManager } from "../managers/portalEntityManager";
import { LinkEntityManager } from "../managers/linkEntityManager";
import { FieldEntityManager } from "../managers/fieldEntityManager";
import { PortalLabelEntityManager } from "../managers/portalLabelEntityManager";
import { PortalHistoryEntityManager } from "../managers/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/scoutHistoryEntityManager";
import { TileRequestManager } from "../managers/tileRequestManager";
import { ScoreManager } from "../managers/scoreManager";
import { RedeemManager } from "../managers/redeemManager";
import { CommManager } from "../managers/commManager";
import { InterfaceManager } from "../managers/interfaceManager";
import { PortalOrnamentEntityManager } from "../managers/portalOrnamentEntityManager.ts";

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
