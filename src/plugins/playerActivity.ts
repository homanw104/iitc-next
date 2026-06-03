/**
 * Player Activity Plugin for IITC Next
 *
 * This plugin tracks player activity by monitoring chat messages for player interactions with portals.
 * It displays player locations and movement paths on the map using Cesium entities.
 */

import * as Cesium from "cesium";
import "../types/iitc.ts";
import { IITCCore } from "../types/iitc";
import { unsafeWindow } from "vite-plugin-monkey/dist/client";

interface PlayerActivity {
  lat: number;
  lng: number;
  timestamp: number;
}

class PlayerActivityPlugin {
  public name = "Player Activity Tracker";
  public id = "player-activity";

  private dataSource: Cesium.CustomDataSource = new Cesium.CustomDataSource("player-activity");
  private playerPoints: Map<string, Cesium.Entity> = new Map();
  private playerPaths: Map<string, Cesium.Entity> = new Map();
  private playerActivities: Map<string, PlayerActivity[]> = new Map();
  private interval: number | undefined;

  private viewer: IITCCore["viewer"];
  private logManager: IITCCore["logManager"];
  private layerManager: IITCCore["layerManager"];
  private commManager: IITCCore["commManager"];

  public init() {
    this.viewer = unsafeWindow.iitc.viewer!;
    this.logManager = unsafeWindow.iitc.logManager!;
    this.layerManager = unsafeWindow.iitc.layerManager!;
    this.commManager = unsafeWindow.iitc.commManager!;

    if (!this.viewer || !this.layerManager || !this.logManager || !this.commManager) {
      console.log("[PlayerActivityPlugin] IITC Next core components missing", {
        viewer: !!this.viewer,
        logManager: !!this.logManager,
        layerManager: !!this.layerManager,
        commManager: !!this.commManager
      });
      return;
    }

    this.dataSource = new Cesium.CustomDataSource("player-activity");
    this.layerManager.getOrCreateSource("player-activity-enl");
    this.layerManager.getOrCreateSource("player-activity-res");
    this.viewer.dataSources.add(this.dataSource).then();

    this.interval = setInterval(() => this.updatePlayerActivity(), 5000);
    this.updatePlayerActivity();
  }

  public cleanup() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }

  private updatePlayerActivity(): void {
    const messages = this.commManager?.getMessages("all");

    messages?.forEach((msg: any) => {
      let player: { name: string, team: string } | null = null;
      let portal: { latE6: number, lngE6: number } | null = null;

      msg.markup.forEach((markup: any) => {
        if (markup[0] === "PLAYER") {
          player = { name: markup[1].plain, team: markup[1].team || "NEUTRAL" };
        } else if (markup[0] === "PORTAL") {
          const data = markup[1];
          if (data.latE6 !== undefined && data.lngE6 !== undefined) {
            portal = { latE6: data.latE6, lngE6: data.lngE6 };
          }
        }
      });

      if (player && portal) {
        const playerName = (player as any).name;
        const lat = (portal as any).latE6 / 1e6;
        const lng = (portal as any).lngE6 / 1e6;
        const timestamp = msg.timestamp;

        let activity = this.playerActivities.get(playerName);
        if (!activity) {
          activity = [];
          this.playerActivities.set(playerName, activity);
        }

        // Avoid duplicate activity at same timestamp
        if (!activity.some(a => a.timestamp === timestamp)) {
          activity.push({ lat, lng, timestamp });
          activity.sort((a, b) => a.timestamp - b.timestamp);
          this.renderPlayer(playerName, (player as any).team);
        }
      }
    });
  };

  private renderPlayer(playerName: string, team: string): void {
    const activity = this.playerActivities.get(playerName);
    if (!activity || activity.length === 0) return;

    const lastLoc = activity[activity.length - 1];
    const position = Cesium.Cartesian3.fromDegrees(lastLoc.lng, lastLoc.lat);
    const color = Cesium.Color.fromCssColorString("#E130DE");

    // Update or create point
    let pointEntity = this.playerPoints.get(playerName);
    if (!pointEntity) {
      pointEntity = this.dataSource.entities.add({
        name: playerName,
        position: position,
        point: {
          pixelSize: 10,
          color: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        },
        label: {
          text: playerName,
          font: "14pt",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BASELINE,
          pixelOffset: new Cesium.Cartesian2(0, -9),
          fillColor: color,
        }
      });
      this.playerPoints.set(playerName, pointEntity);
    } else {
      pointEntity.position = new Cesium.ConstantPositionProperty(position) as any;
    }

    // Update or create path
    if (activity.length > 1) {
      const positions = activity.map(a => Cesium.Cartesian3.fromDegrees(a.lng, a.lat));
      let pathEntity = this.playerPaths.get(playerName);
      if (!pathEntity) {
        pathEntity = this.dataSource.entities.add({
          polyline: {
            positions: positions,
            width: 2,
            material: color.withAlpha(0.5) as any,
          }
        });
        this.playerPaths.set(playerName, pathEntity);
      } else {
        if (pathEntity.polyline) {
          pathEntity.polyline.positions = new Cesium.ConstantProperty(positions) as any;
        }
      }
    }
  }
}

const register = () => {
  if (unsafeWindow.iitc && unsafeWindow.iitc.pluginManager) {
    unsafeWindow.iitc.pluginManager.registerPlugin(new PlayerActivityPlugin());
  } else {
    setTimeout(register, 1000);
  }
};

register();
