/**
 * Manages the comm messages and their storage.
 */

import { apiRequest } from "../utils/network";
import { logManager } from "./logManager";
import * as Cesium from "cesium";

export interface PlextMarkData {
  plain: string;
  team?: string;
  latE6?: number;
  lngE6?: number;
  name?: string;
  address?: string;
}

export type PlextMark = [string, PlextMarkData];

export interface Plext {
  guid: string;
  timestamp: number;
  text: string;
  markup: PlextMark[];
}

export interface CommResponse {
  result: any[][];
}

export class CommManager {
  private viewer: Cesium.Viewer;
  private messages: Record<string, Map<string, Plext>> = {
    all: new Map(),
    faction: new Map(),
    alerts: new Map(),
  };

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  private getBounds() {
    const viewRect = this.viewer.camera.computeViewRectangle();
    if (viewRect) {
      return {
        minLatE6: Math.round(Cesium.Math.toDegrees(viewRect.south) * 1e6),
        minLngE6: Math.round(Cesium.Math.toDegrees(viewRect.west) * 1e6),
        maxLatE6: Math.round(Cesium.Math.toDegrees(viewRect.north) * 1e6),
        maxLngE6: Math.round(Cesium.Math.toDegrees(viewRect.east) * 1e6),
      };
    }
    // Fallback or handle null
    return {
      minLatE6: -90000000,
      minLngE6: -180000000,
      maxLatE6: 90000000,
      maxLngE6: 180000000,
    };
  }

  public getMessages(channel: string, bounds?: { minLatE6: number; minLngE6: number; maxLatE6: number; maxLngE6: number }): Plext[] {
    const channelMessages = Array.from(this.messages[channel]?.values() || []);
    if (!bounds) {
      return channelMessages.sort((a, b) => a.timestamp - b.timestamp);
    }

    return channelMessages.filter((m) => {
      const portalMarkup = m.markup.find((markup) => {
        return markup[0] === "PORTAL";
      });
      if (portalMarkup) {
        const data = portalMarkup[1];
        if (data.latE6 !== undefined && data.lngE6 !== undefined) {
          return (
            data.latE6 >= bounds.minLatE6 &&
            data.latE6 <= bounds.maxLatE6 &&
            data.lngE6 >= bounds.minLngE6 &&
            data.lngE6 <= bounds.maxLngE6
          );
        }
      }
      return true;  // System message with no coordinates or other type
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  public async requestAll(fetchOld: boolean = false): Promise<void> {
    await this.requestChannel("all", fetchOld);
  }

  public async requestFaction(fetchOld: boolean = false): Promise<void> {
    await this.requestChannel("faction", fetchOld);
  }

  public async requestAlerts(fetchOld: boolean = false): Promise<void> {
    await this.requestChannel("alerts", fetchOld);
  }

  private async requestChannel(channel: string, fetchOld: boolean): Promise<void> {
    try {
      const bounds = this.getBounds();

      let minTimestamp = -1;
      let maxTimestamp = -1;
      let ascendingTimestampOrder = true;
      let plextContinuationGuid: string | undefined = undefined;

      const existing = Array.from(this.messages[channel].values());

      if (existing.length > 0) {
        if (fetchOld) {
          maxTimestamp = Math.min(...existing.map(m => m.timestamp));
          ascendingTimestampOrder = false;
          plextContinuationGuid = existing.find(m => m.timestamp === maxTimestamp)?.guid;
        } else {
          minTimestamp = Math.max(...existing.map(m => m.timestamp));
          ascendingTimestampOrder = true;
          plextContinuationGuid = existing.find(m => m.timestamp === minTimestamp)?.guid;
        }
      }

      const payload: any = {
        minLatE6: bounds.minLatE6,
        minLngE6: bounds.minLngE6,
        maxLatE6: bounds.maxLatE6,
        maxLngE6: bounds.maxLngE6,
        minTimestampMs: minTimestamp,
        maxTimestampMs: maxTimestamp,
        tab: channel,
        ascendingTimestampOrder: ascendingTimestampOrder,
      };

      if (plextContinuationGuid) payload.plexContinuationGuid = plextContinuationGuid;

      const data = (await apiRequest("getPlexts", payload)) as CommResponse;

      if (data && data.result) {
        const plexts = data.result.map((item) => ({
          guid: item[0],
          timestamp: item[1],
          text: item[2].plext.text,
          markup: item[2].plext.markup,
        }));

        plexts.forEach(p => {
          this.messages[channel].set(p.guid, p);
        });

        // Limit storage to 1000000 messages per channel to avoid memory leaks
        if (this.messages[channel].size > 1000000) {
          const sorted = Array.from(this.messages[channel].values()).sort((a, b) => b.timestamp - a.timestamp);
          const toRemove = sorted.slice(1000000);
          toRemove.forEach(m => this.messages[channel].delete(m.guid));
        }
      }
    } catch (e) {
      logManager.error("CommManager", `Failed to fetch ${channel} comms`, e);
    }
  }
}
