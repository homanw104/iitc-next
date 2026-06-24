/**
 * Manages the comm messages and their storage.
 */

import { intelApiClient } from "../../api/intelApiClient";
import { logManager } from "../system/logManager";
import * as Cesium from "cesium";
import type { Channel } from "../../types/ingress";
import type {
  CommPlextData,
  CommResponseItem,
  GetPlextsPayload,
  PlextMark,
  PlextMarkData,
  PlextMarkType,
} from "../../types/intelApi";

const LOG_TAG = "CommManager";
const MIN_COMM_BOUNDS_KM = 10;
const MIN_KM_PER_DEGREE = 110.574;
const LATITUDE_DEGREES_RANGE = { min: -90, max: 90 };
const LONGITUDE_DEGREES_RANGE = { min: -180, max: 180 };

export type { CommPlextData, CommResponseItem, PlextMark, PlextMarkData, PlextMarkType };

export class CommManager {
  private viewer: Cesium.Viewer;
  private messages: Record<string, Map<string, CommResponseItem>> = {
    all: new Map(),
    faction: new Map(),
    alerts: new Map(),
  };
  private callbacks: (() => void)[] = [];

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  private expandRangeToMinSpan(
    min: number,
    max: number,
    minSpan: number,
    range: { min: number; max: number }
  ): {
    min: number;
    max: number;
  } {
    const fullSpan = range.max - range.min;
    if (minSpan >= fullSpan) {
      return range;
    }

    if (max - min >= minSpan) {
      return {
        min: Math.max(min, range.min),
        max: Math.min(max, range.max),
      };
    }

    // Expand around the current view center so tiny zoomed-in views still fetch a useful comm area.
    const center = (min + max) / 2;
    let expandedMin = center - minSpan / 2;
    let expandedMax = center + minSpan / 2;

    if (expandedMin < range.min) {
      expandedMax += range.min - expandedMin;
      expandedMin = range.min;
    }
    if (expandedMax > range.max) {
      expandedMin -= expandedMax - range.max;
      expandedMax = range.max;
    }

    return {
      min: Math.max(expandedMin, range.min),
      max: Math.min(expandedMax, range.max),
    };
  }

  private getBounds(): {
    minLatE6: number;
    minLngE6: number;
    maxLatE6: number;
    maxLngE6: number;
  } {
    const viewRect = this.viewer.camera.computeViewRectangle();
    if (viewRect) {
      const south = Cesium.Math.toDegrees(viewRect.south);
      const west = Cesium.Math.toDegrees(viewRect.west);
      const north = Cesium.Math.toDegrees(viewRect.north);
      const east = Cesium.Math.toDegrees(viewRect.east);
      const center = Cesium.Rectangle.center(viewRect);
      const centerLat = Cesium.Math.toDegrees(center.latitude);

      // Use the smallest latitude degree length so the converted span is always at least 5 km.
      const minLatSpan = MIN_COMM_BOUNDS_KM / MIN_KM_PER_DEGREE;
      const latitude = this.expandRangeToMinSpan(
        south,
        north,
        minLatSpan,
        LATITUDE_DEGREES_RANGE
      );

      let longitude = LONGITUDE_DEGREES_RANGE;
      if (east >= west) {
        // Longitude degrees shrink by cos(latitude); near the poles, 5 km may require the full line.
        const longitudeScale = Math.cos(Cesium.Math.toRadians(centerLat));
        const minLngSpan = longitudeScale > 0
          ? MIN_COMM_BOUNDS_KM / (MIN_KM_PER_DEGREE * longitudeScale)
          : LONGITUDE_DEGREES_RANGE.max - LONGITUDE_DEGREES_RANGE.min;
        longitude = this.expandRangeToMinSpan(
          west,
          east,
          minLngSpan,
          LONGITUDE_DEGREES_RANGE
        );
      }

      return {
        minLatE6: Math.round(latitude.min * 1e6),
        minLngE6: Math.round(longitude.min * 1e6),
        maxLatE6: Math.round(latitude.max * 1e6),
        maxLngE6: Math.round(longitude.max * 1e6),
      };
    }

    // Fall back or handle null
    return {
      minLatE6: -90000000,
      minLngE6: -180000000,
      maxLatE6: 90000000,
      maxLngE6: 180000000,
    };
  }

  public setOnReceiveMsgCallback(callback: () => void): void {
    this.callbacks.push(callback);
  }

  public unsetOnReceiveMsgCallback(callback: () => void): void {
    this.callbacks = this.callbacks.filter(cb => cb !== callback);
  }

  public getMessages(channel: Channel, calcBounds: boolean = true): CommResponseItem[] {
    const channelMessages = Array.from(this.messages[channel]?.values() || []);
    const bounds = this.getBounds();
    if (bounds && calcBounds) {
      return channelMessages.filter((m) => {
        const portalMarkup = m[2].plext.markup.find((markup) => {
          return markup[0] === "PORTAL";
        });
        const plextType = m[2].plext.plextType;
        if (portalMarkup && plextType !== "SYSTEM_NARROWCAST") {
          const data = portalMarkup[1];
          if (data.latE6 !== undefined && data.lngE6 !== undefined) {
            return (
              data.latE6 >= bounds.minLatE6 &&
              data.latE6 <= bounds.maxLatE6 &&
              data.lngE6 >= bounds.minLngE6 &&
              data.lngE6 <= bounds.maxLngE6
            );
          }
        } else {
          return true;  // System message with no coordinates or alerts (SYSTEM_NARROWCAST), etc.
        }
      }).sort((a, b) => a[1] - b[1]);
    } else {
      return channelMessages.sort((a, b) => a[1] - b[1]);
    }
  }

  public async sendMessage(channel: string, message: string): Promise<void> {
    try {
      const viewRect = this.viewer.camera.computeViewRectangle();
      let latE6 = 0;
      let lngE6 = 0;

      if (viewRect) {
        latE6 = Math.round(Cesium.Math.toDegrees(Cesium.Rectangle.center(viewRect).latitude) * 1e6);
        lngE6 = Math.round(Cesium.Math.toDegrees(Cesium.Rectangle.center(viewRect).longitude) * 1e6);
      }

      const payload = {
        message,
        latE6,
        lngE6,
        tab: channel
      };

      const response = await intelApiClient.sendPlext(payload);
      if (response && response.error) {
        logManager.error(LOG_TAG, `Failed to send message to ${channel} channel`, response.error);
      }
    } catch (e) {
      logManager.error(LOG_TAG, `Failed to send message to ${channel} channel`, e);
    }
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
      let ascendingTimestampOrder = false;
      let plextContinuationGuid: string | undefined = undefined;

      const existing = this.getMessages(channel);

      if (existing.length > 0) {
        if (fetchOld) {
          maxTimestamp = Math.min(...existing.map(m => m[1]));
          ascendingTimestampOrder = false;
          plextContinuationGuid = existing.find(m => m[1] === maxTimestamp)?.[0];
        } else {
          minTimestamp = Math.max(...existing.map(m => m[1]));
          ascendingTimestampOrder = true;
          plextContinuationGuid = existing.find(m => m[1] === minTimestamp)?.[0];
        }
      }

      const payload: GetPlextsPayload = {
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

      const data = await intelApiClient.getPlexts(payload);

      if (data && data.result) {
        data.result.forEach(item => {
          this.messages[channel].set(item[0], item);
        });

        // Run callbacks
        this.callbacks.forEach(cb => cb());

        // Limit storage to one million messages per channel to avoid memory leaks
        if (this.messages[channel].size > 1000000) {
          const sorted = Array.from(this.messages[channel].values()).sort((a, b) => b[1] - a[1]);
          const toRemove = sorted.slice(1000000);
          toRemove.forEach(m => this.messages[channel].delete(m[0]));
        }
      }
    } catch (e) {
      logManager.error(LOG_TAG, `Failed to fetch ${channel} comms`, e);
    }
  }
}
