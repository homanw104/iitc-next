/**
 * Creates and exposes the core managers that coordinate IITC runtime behavior.
 */

import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc";
import { LayerManager } from "../managers/layerManager";
import { EntityPositionManager } from "../managers/entityPositionManager";
import { SceneEventManager } from "../managers/sceneEventManager";
import { PortalEntityManager } from "../managers/portalEntityManager";
import { PortalLabelEntityManager } from "../managers/portalLabelEntityManager";
import { PortalOrnamentEntityManager } from "../managers/portalOrnamentEntityManager.ts";
import { PortalHistoryEntityManager } from "../managers/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/scoutHistoryEntityManager";
import { LinkEntityManager } from "../managers/linkEntityManager";
import { FieldEntityManager } from "../managers/fieldEntityManager";
import { DebugTileEntityManager } from "../managers/debugTileEntityManager";
import { TileRequestManager } from "../managers/tileRequestManager";
import { CommManager } from "../managers/commManager";
import { ScoreManager } from "../managers/scoreManager";
import { RedeemManager } from "../managers/redeemManager";
import { InterfaceManager } from "../managers/interfaceManager";

export interface CoreManagers {
  layerManager: LayerManager;
  sceneEventManager: SceneEventManager;
  entityPositionManager: EntityPositionManager;
  portalEntityManager: PortalEntityManager;
  portalLabelEntityManager: PortalLabelEntityManager;
  portalOrnamentEntityManager: PortalOrnamentEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  linkEntityManager: LinkEntityManager;
  fieldEntityManager: FieldEntityManager;
  debugTileEntityManager: DebugTileEntityManager;
  tileRequestManager: TileRequestManager;
  commManager: CommManager;
  scoreManager: ScoreManager;
  redeemManager: RedeemManager;
  interfaceManager: InterfaceManager;
}

export function createCoreManagers(viewer: Cesium.Viewer, container: HTMLElement): CoreManagers {
  const layerManager = new LayerManager(viewer);
  const sceneEventManager = new SceneEventManager(viewer);
  const entityPositionManager = new EntityPositionManager(viewer, sceneEventManager);
  const portalEntityManager = new PortalEntityManager(layerManager, entityPositionManager);
  const portalLabelEntityManager = new PortalLabelEntityManager(layerManager, entityPositionManager);
  const portalOrnamentEntityManager = new PortalOrnamentEntityManager(layerManager, entityPositionManager);
  const portalHistoryEntityManager = new PortalHistoryEntityManager(layerManager, entityPositionManager);
  const scoutHistoryEntityManager = new ScoutHistoryEntityManager(layerManager, entityPositionManager);
  const linkEntityManager = new LinkEntityManager(layerManager, portalEntityManager);
  const fieldEntityManager = new FieldEntityManager(layerManager, portalEntityManager);
  const debugTileEntityManager = new DebugTileEntityManager(viewer, layerManager);
  const tileRequestManager = new TileRequestManager(viewer, portalEntityManager, portalLabelEntityManager, portalOrnamentEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, linkEntityManager, fieldEntityManager);
  const commManager = new CommManager(viewer);
  const scoreManager = new ScoreManager();
  const redeemManager = new RedeemManager();
  const interfaceManager = new InterfaceManager(container);

  tileRequestManager.onTileStatusChange((key, status) => debugTileEntityManager.updateTile(key, status));

  return {
    layerManager,
    sceneEventManager,
    entityPositionManager,
    portalEntityManager,
    portalLabelEntityManager,
    portalOrnamentEntityManager,
    portalHistoryEntityManager,
    scoutHistoryEntityManager,
    linkEntityManager,
    fieldEntityManager,
    debugTileEntityManager,
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
  iitc.sceneEventManager = managers.sceneEventManager;
  iitc.entityPositionManager = managers.entityPositionManager;
  iitc.portalEntityManager = managers.portalEntityManager;
  iitc.portalLabelEntityManager = managers.portalLabelEntityManager;
  iitc.portalOrnamentEntityManager = managers.portalOrnamentEntityManager;
  iitc.portalHistoryEntityManager = managers.portalHistoryEntityManager;
  iitc.scoutHistoryEntityManager = managers.scoutHistoryEntityManager;
  iitc.linkEntityManager = managers.linkEntityManager;
  iitc.fieldEntityManager = managers.fieldEntityManager;
  iitc.tileRequestManager = managers.tileRequestManager;
  iitc.commManager = managers.commManager;
  iitc.scoreManager = managers.scoreManager;
  iitc.redeemManager = managers.redeemManager;
  iitc.interfaceManager = managers.interfaceManager;
}
