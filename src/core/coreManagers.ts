/**
 * Creates and exposes the core managers that coordinate IITC runtime behavior.
 */

import * as Cesium from "cesium";
import type { IITCCore } from "../types/iitc";
import { LayerManager } from "../managers/layer/layerManager";
import { EntityPositionManager } from "../managers/entity/entityPositionManager";
import { EntityTranslucencyManager } from "../managers/entity/entityTranslucencyManager";
import { SceneEventManager } from "../managers/system/sceneEventManager";
import { PortalEntityManager } from "../managers/entity/portalEntityManager";
import { PortalLabelEntityManager } from "../managers/entity/portalLabelEntityManager";
import { PortalOrnamentEntityManager } from "../managers/entity/portalOrnamentEntityManager.ts";
import { PortalHistoryEntityManager } from "../managers/entity/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/entity/scoutHistoryEntityManager";
import { LinkEntityManager } from "../managers/entity/linkEntityManager";
import { FieldEntityManager } from "../managers/entity/fieldEntityManager";
import { DebugTileEntityManager } from "../managers/entity/debugTileEntityManager";
import { TileRequestManager } from "../managers/tiles/tileRequestManager.ts";
import { CommManager } from "../managers/comm/commManager";
import { ScoreManager } from "../managers/game/scoreManager";
import { RedeemManager } from "../managers/game/redeemManager";
import { InterfaceManager } from "../managers/system/interfaceManager";

export interface CoreManagers {
  layerManager: LayerManager;
  sceneEventManager: SceneEventManager;
  entityPositionManager: EntityPositionManager;
  entityTranslucencyManager: EntityTranslucencyManager;
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
  const entityTranslucencyManager = new EntityTranslucencyManager(viewer);
  const portalEntityManager = new PortalEntityManager(viewer, layerManager, entityPositionManager, entityTranslucencyManager);
  const portalLabelEntityManager = new PortalLabelEntityManager(viewer, layerManager, entityPositionManager);
  const portalOrnamentEntityManager = new PortalOrnamentEntityManager(layerManager, entityPositionManager, entityTranslucencyManager);
  const portalHistoryEntityManager = new PortalHistoryEntityManager(layerManager, entityPositionManager, entityTranslucencyManager);
  const scoutHistoryEntityManager = new ScoutHistoryEntityManager(layerManager, entityPositionManager, entityTranslucencyManager);
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
    entityTranslucencyManager,
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
  iitc.entityTranslucencyManager = managers.entityTranslucencyManager;
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
