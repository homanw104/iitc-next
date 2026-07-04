/**
 * Creates and exposes the core managers that coordinate IITC runtime behavior.
 */

import type * as Cesium from "cesium";
import { CommManager } from "../../managers/comm/commManager.ts";
import { DebugTileEntityManager } from "../../managers/entity/debugTileEntityManager.ts";
import { EntityPositionManager } from "../../managers/entity/entityPositionManager.ts";
import { EntityTranslucencyManager } from "../../managers/entity/entityTranslucencyManager.ts";
import { FieldEntityManager } from "../../managers/entity/fieldEntityManager.ts";
import { LinkEntityManager } from "../../managers/entity/linkEntityManager.ts";
import { PortalEntityManager } from "../../managers/entity/portalEntityManager.ts";
import { PortalHistoryEntityManager } from "../../managers/entity/portalHistoryEntityManager.ts";
import { PortalLabelEntityManager } from "../../managers/entity/portalLabelEntityManager.ts";
import { PortalOrnamentEntityManager } from "../../managers/entity/portalOrnamentEntityManager.ts";
import { ScoutHistoryEntityManager } from "../../managers/entity/scoutHistoryEntityManager.ts";
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
  const loadingProgressManager = new LoadingProgressManager(viewer);
  const entityPositionManager = new EntityPositionManager(viewer, loadingProgressManager);
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

  return {
    layerManager,
    loadingProgressManager,
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
