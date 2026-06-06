/**
 * Class to manage and fetch game scores.
 */

import { apiRequest } from "../utils/network";
import { logManager } from "./logManager";

export class ScoreManager {
  private enlScore: number = 0;
  private resScore: number = 0;

  constructor() {
    this.fetchGameScore().then(() => {
      logManager.debug("ScoreManager", "Game score fetched");
    }).catch(e => {
      logManager.error("ScoreManager", "Failed to fetch game score", e);
    });
  }

  public async fetchGameScore() {
    try {
      const data = (await apiRequest("getGameScore", {})) as any;
      if (data && data.result) {
        this.enlScore = parseInt(data.result[0]);
        this.resScore = parseInt(data.result[1]);
      }
    } catch (e) {
      logManager.error("ScoreManager", "Failed to fetch game score", e);
    }
  }

  public getEnlScore(): number {
    return this.enlScore;
  }

  public getResScore(): number {
    return this.resScore;
  }
}
