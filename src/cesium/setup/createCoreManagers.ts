/**
 * Creates and exposes the core managers that coordinate IITC runtime behavior.
 */

import type * as Cesium from "cesium";
import { CommManager } from "../../managers/comm/commManager.ts";
import { DebugTileManager } from "../../managers/entity/debugTileManager.ts";
import { EntityPositionManager } from "../../managers/entity/entityPositionManager.ts";
import { EntityTranslucencyManager } from "../../managers/entity/entityTranslucencyManager.ts";
import { FieldManager } from "../../managers/entity/fieldManager.ts";
import { LinkManager } from "../../managers/entity/linkManager.ts";
import { PortalManager } from "../../managers/entity/portalManager.ts";
import { PortalHistoryManager } from "../../managers/entity/portalHistoryManager.ts";
import { PortalLabelManager } from "../../managers/entity/portalLabelManager.ts";
import { PortalOrnamentManager } from "../../managers/entity/portalOrnamentManager.ts";
import { ScoutHistoryManager } from "../../managers/entity/scoutHistoryManager.ts";
import { RedeemManager } from "../../managers/game/redeemManager.ts";
import { ScoreManager } from "../../managers/game/scoreManager.ts";
import { LayerManager } from "../../managers/layer/layerManager.ts";
import { InterfaceManager } from "../../managers/system/interfaceManager.ts";
import { LoadingProgressManager } from "../../managers/system/loadingProgressManager.ts";
import { TileRequestManager } from "../../managers/tiles/tileRequestManager.ts";

export interface CoreManagers {
  layerManager: LayerManager;
  loadingProgressManager: LoadingProgressManager;
  entityPositionManager: EntityPositionManager;
  entityTranslucencyManager: EntityTranslucencyManager;
  portalManager: PortalManager;
  portalLabelManager: PortalLabelManager;
  portalOrnamentManager: PortalOrnamentManager;
  portalHistoryManager: PortalHistoryManager;
  scoutHistoryManager: ScoutHistoryManager;
  linkManager: LinkManager;
  fieldManager: FieldManager;
  debugTileManager: DebugTileManager;
  tileRequestManager: TileRequestManager;
  commManager: CommManager;
  scoreManager: ScoreManager;
  redeemManager: RedeemManager;
  interfaceManager: InterfaceManager;
}

export function createCoreManagers(viewer: Cesium.Viewer, container: HTMLElement): CoreManagers {
  const layerManager = new LayerManager(viewer);
  const loadingProgressManager = new LoadingProgressManager(viewer);
  const entityPositionManager = new EntityPositionManager(viewer, loadingProgressManager);
  const entityTranslucencyManager = new EntityTranslucencyManager(viewer);
  const portalManager = new PortalManager(viewer, layerManager, entityPositionManager, entityTranslucencyManager);
  const portalLabelManager = new PortalLabelManager(viewer, layerManager, entityPositionManager);
  const portalOrnamentManager = new PortalOrnamentManager(viewer, layerManager, entityPositionManager, entityTranslucencyManager);
  const portalHistoryManager = new PortalHistoryManager(viewer, layerManager, entityPositionManager, entityTranslucencyManager);
  const scoutHistoryManager = new ScoutHistoryManager(viewer, layerManager, entityPositionManager, entityTranslucencyManager);
  const linkManager = new LinkManager(layerManager, portalManager);
  const fieldManager = new FieldManager(layerManager, portalManager);
  const debugTileManager = new DebugTileManager(viewer, layerManager);
  const tileRequestManager = new TileRequestManager(viewer, portalManager, portalLabelManager, portalOrnamentManager, portalHistoryManager, scoutHistoryManager, linkManager, fieldManager);
  const commManager = new CommManager(viewer);
  const scoreManager = new ScoreManager();
  const redeemManager = new RedeemManager();
  const interfaceManager = new InterfaceManager(container);

  return {
    layerManager,
    loadingProgressManager,
    entityPositionManager,
    entityTranslucencyManager,
    portalManager,
    portalLabelManager,
    portalOrnamentManager,
    portalHistoryManager,
    scoutHistoryManager,
    linkManager,
    fieldManager,
    debugTileManager,
    tileRequestManager,
    commManager,
    scoreManager,
    redeemManager,
    interfaceManager,
  };
}
