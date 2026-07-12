import type { ScoreManager } from "../../../managers/game/scoreManager.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h, Fragment } from "../../../utils/dom.ts";

const GameScore = ({ scoreManager }: {
  scoreManager: ScoreManager,
}) => {
  const totalEnl = scoreManager.getEnlScore();
  const totalRes = scoreManager.getResScore();
  const totalScore = totalEnl + totalRes;
  const enlPercentage = totalScore > 0 ? (totalEnl / totalScore) * 100 : 50;
  const resPercentage = totalScore > 0 ? (totalRes / totalScore) * 100 : 50;

  return (
    <>
      <div style={{ marginTop: "20px" }}>Global Score</div>
      <div style={{ width: "100%", height: "24px", minHeight: "24px", display: "flex", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          width: `${enlPercentage}%`,
          backgroundColor: getTeamColor("ENLIGHTENED").toCssColorString(),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}>
          {Math.round(enlPercentage)}%
        </div>
        <div style={{
          width: `${resPercentage}%`,
          backgroundColor: getTeamColor("RESISTANCE").toCssColorString(),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}>
          {Math.round(resPercentage)}%
        </div>
      </div>
    </>
  );
};

export default GameScore;
