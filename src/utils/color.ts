/**
 * Utilities to get cesium colors for teams.
 */

import * as Cesium from "cesium";
import type { Team } from "../types/ingress";

export function getTeamColor(team: Team): Cesium.Color {
  switch (team) {
    case "ENLIGHTENED": return new Cesium.Color(5/255, 217/255, 3/255, 1.0);
    case "RESISTANCE": return new Cesium.Color(3/255, 139/255, 255/255, 1.0);
    case "MACHINA": return new Cesium.Color(255/255, 0/255, 41/255, 1.0);
    case "NEUTRAL": return Cesium.Color.LIGHTGRAY;
    default: return Cesium.Color.WHITE;   // Should never happen
  }
}
