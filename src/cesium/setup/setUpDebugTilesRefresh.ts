/**
 * Hooks up the tile request manager to the debug tile entity manager
 * so that when a tile's status changes, the debug tile entity manager is notified
 * and can update the debug tiles accordingly.
 */

import { TileRequestManager } from "../../managers/tiles/tileRequestManager.ts";
import { DebugTileManager } from "../../managers/entity/debugTileManager.ts";

export function setUpDebugTilesRefresh(tileRequestManager: TileRequestManager, debugTileManager: DebugTileManager) {
  tileRequestManager.onTileStatusChange((key, status) => debugTileManager.updateTile(key, status));
}
