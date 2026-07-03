/**
 * Class to manage and fetch game scores.
 */

import { apiRequestManager } from "../system/apiRequestManager.ts";
import { logManager } from "../system/logManager";

const LOG_TAG = "ScoreManager";

export class ScoreManager {
  private enlScore: number = 0;
  private resScore: number = 0;

  constructor() {
    this.fetchGameScore().then(() => {
      logManager.debug(LOG_TAG, "Game score fetched");
    }).catch(e => {
      logManager.error(LOG_TAG, "Failed to fetch game score", JSON.stringify(e));
    });
  }

  public async fetchGameScore() {
    try {
      const data = await apiRequestManager.getGameScore();
      if (data && data.result) {
        this.enlScore = parseInt(data.result[0]);
        this.resScore = parseInt(data.result[1]);
      }
    } catch (e) {
      logManager.error(LOG_TAG, "Failed to fetch game score", e);
    }
  }

  public getEnlScore(): number {
    return this.enlScore;
  }

  public getResScore(): number {
    return this.resScore;
  }
}
