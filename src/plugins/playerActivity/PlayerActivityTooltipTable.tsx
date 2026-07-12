import { h } from "../../utils/dom.ts";

interface PlayerActivityTooltipActivity {
  name: string;
  portalName: string;
  timestamp: number;
}

export interface PlayerActivityTooltip<TActivity extends PlayerActivityTooltipActivity = PlayerActivityTooltipActivity> {
  title: string;
  activities: TActivity[];
  rowLabel: "name" | "portalName";
}

export const PlayerActivityTooltipTable = ({ tooltip }: {
  tooltip: PlayerActivityTooltip;
}): HTMLElement => {
  return (
    <table>
      <thead>
      <tr>
        <th style={{ textAlign: "left" }}>{tooltip.title}</th>
      </tr>
      </thead>
      <tbody>
      {tooltip.activities.map((activity) => {
        return (
          <tr style={{ fontSize: "12px" }}>
            <td style={{ paddingRight: "8px" }}>{activity[tooltip.rowLabel]}</td>
            <td style={{ textAlign: "right" }}>{calcTimeAgoStr(activity.timestamp)}</td>
          </tr>
        ) as HTMLElement;
      })}
      </tbody>
    </table>
  ) as HTMLElement;
};

function calcTimeAgoStr(time: number): string {
  const timeDiff = (Date.now() - time) / 1000;
  const hours = Math.floor(timeDiff / 60 / 60);
  const minutes = Math.floor(timeDiff / 60 % 60);
  const hourStr = hours === 0 ? "" : hours === 1 ? "1 hr" : hours > 1 ? hours + (" hrs") : "";
  const minutesStr = minutes === 0 ? "0 min" : minutes === 1 ? "1 min" : minutes > 1 ? minutes + (" mins") : "";
  return `${hourStr} ${minutesStr} ago`;
}
