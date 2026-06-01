import * as Cesium from "cesium";
import { LogManager } from "../managers/logManager";
import { EntityManager } from "../managers/entityManager";
import { TileRequestManager } from "../managers/tileRequestManager";
import { ScoreManager } from "../managers/scoreManager";
import { RedeemManager } from "../managers/redeemManager";
import { CommManager } from "../managers/commManager";

export interface IITCPlugin {
  name: string;
  id: string;
  init: () => void;
  deinit?: () => void;
}

export interface IITCCore {
  logManager?: LogManager;
  viewer?: Cesium.Viewer;
  entityManager?: EntityManager;
  tileRequestManager?: TileRequestManager;
  scoreManager?: ScoreManager;
  redeemManager?: RedeemManager;
  commManager?: CommManager;
  plugins?: IITCPlugin[];
  registerPlugin?: (plugin: IITCPlugin) => void;
}

declare global {
  interface Window {
    iitc: IITCCore;
  }
}
