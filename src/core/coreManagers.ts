import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc";
import { CommManager } from "../managers/commManager";
import { DebugTileEntityManager } from "../managers/debugTileEntityManager";
import { FieldEntityManager } from "../managers/fieldEntityManager";
import { InterfaceManager } from "../managers/interfaceManager";
import { LayerManager } from "../managers/layerManager";
import { LinkEntityManager } from "../managers/linkEntityManager";
import { PortalEntityManager } from "../managers/portalEntityManager";
import { PortalHistoryEntityManager } from "../managers/portalHistoryEntityManager";
import { RedeemManager } from "../managers/redeemManager";
import { ScoreManager } from "../managers/scoreManager";
import { ScoutHistoryEntityManager } from "../managers/scoutHistoryEntityManager";
import { TileRequestManager } from "../managers/tileRequestManager";

export interface CoreManagers {
  layerManager: LayerManager;
  portalEntityManager: PortalEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  linkEntityManager: LinkEntityManager;
  fieldEntityManager: FieldEntityManager;
  tileRequestManager: TileRequestManager;
  commManager: CommManager;
  scoreManager: ScoreManager;
  redeemManager: RedeemManager;
  interfaceManager: InterfaceManager;
}

export function createCoreManagers(viewer: Cesium.Viewer, container: HTMLElement): CoreManagers {
  const layerManager = new LayerManager(viewer);
  const portalEntityManager = new PortalEntityManager(layerManager);
  const portalHistoryEntityManager = new PortalHistoryEntityManager(layerManager);
  const scoutHistoryEntityManager = new ScoutHistoryEntityManager(layerManager);
  const linkEntityManager = new LinkEntityManager(layerManager, portalEntityManager);
  const fieldEntityManager = new FieldEntityManager(layerManager, portalEntityManager);
  const debugTileEntityManager = new DebugTileEntityManager(viewer, layerManager);
  const tileRequestManager = new TileRequestManager(viewer, portalEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, linkEntityManager, fieldEntityManager);
  const commManager = new CommManager(viewer);
  const scoreManager = new ScoreManager();
  const redeemManager = new RedeemManager();
  const interfaceManager = new InterfaceManager(container);

  tileRequestManager.onTileStatusChange((key, status) => debugTileEntityManager.updateTile(key, status));

  return {
    layerManager,
    portalEntityManager,
    portalHistoryEntityManager,
    scoutHistoryEntityManager,
    linkEntityManager,
    fieldEntityManager,
    tileRequestManager,
    commManager,
    scoreManager,
    redeemManager,
    interfaceManager,
  };
}

export function exposeCoreManagers(iitc: IITCCore, viewer: Cesium.Viewer, managers: CoreManagers): void {
  iitc.viewer = viewer;
  iitc.layerManager = managers.layerManager;
  iitc.interfaceManager = managers.interfaceManager;
  iitc.portalEntityManager = managers.portalEntityManager;
  iitc.linkEntityManager = managers.linkEntityManager;
  iitc.fieldEntityManager = managers.fieldEntityManager;
  iitc.portalHistoryEntityManager = managers.portalHistoryEntityManager;
  iitc.scoutHistoryEntityManager = managers.scoutHistoryEntityManager;
  iitc.tileRequestManager = managers.tileRequestManager;
  iitc.scoreManager = managers.scoreManager;
  iitc.redeemManager = managers.redeemManager;
  iitc.commManager = managers.commManager;
}
