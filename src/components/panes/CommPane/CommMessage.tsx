import * as Cesium from "cesium";
import type { Viewer } from "cesium";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../../cesium/setup/mountCoreControllersAndUI.ts";
import type { PortalEntityManager } from "../../../managers/entity/portalEntityManager.ts";
import type { PortalHistoryEntityManager } from "../../../managers/entity/portalHistoryEntityManager.ts";
import type { PortalLabelEntityManager } from "../../../managers/entity/portalLabelEntityManager.ts";
import type { PortalOrnamentEntityManager } from "../../../managers/entity/portalOrnamentEntityManager.ts";
import type { ScoutHistoryEntityManager } from "../../../managers/entity/scoutHistoryEntityManager.ts";
import type { TileRequestManager } from "../../../managers/tiles/tileRequestManager.ts";
import type { Channel } from "../../../types/ingress.ts";
import type { CommResponseItem } from "../../../types/api.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h } from "../../../utils/dom.ts";
import PortalDetailBar from "../../buttons/PortalDetailBar/PortalDetailBar.tsx";

let latestPortalSelectionRequest = 0;

async function selectLoadedPortal(
  viewer: Viewer,
  container: HTMLElement,
  portalEntityManager: PortalEntityManager,
  portalLabelEntityManager: PortalLabelEntityManager,
  portalOrnamentEntityManager: PortalOrnamentEntityManager,
  portalHistoryEntityManager: PortalHistoryEntityManager,
  scoutHistoryEntityManager: ScoutHistoryEntityManager,
  portalDetailPaneController: PortalDetailPaneController,
  portalDetailState: PortalDetailState,
  latE6: number,
  lngE6: number,
  requestId: number
): Promise<boolean> {
  try {
    const portalData = portalEntityManager.getPortalDataByCoordinates(latE6, lngE6);
    if (!portalData) return false;

    const portalGuid = portalData.guid;
    viewer.selectedEntity = portalEntityManager.getPortalEntity(portalGuid);

    await portalEntityManager.requestPortalDetails(portalGuid);
    if (requestId !== latestPortalSelectionRequest) return true;

    const freshData = portalEntityManager.getPortalData(portalGuid);
    if (!freshData) return false;

    portalDetailState.lastPortalData = freshData;
    portalDetailState.portalDetailBar?.remove();
    portalDetailState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: freshData }));
    portalDetailPaneController.updateDetailPane(freshData);
    await portalLabelEntityManager.addOrUpdateLabel(freshData);
    await portalOrnamentEntityManager.addOrUpdateOrnament(freshData);
    await portalHistoryEntityManager.addOrUpdateHistoryHalo(freshData);
    await scoutHistoryEntityManager.addOrUpdateScoutControlHalo(freshData);
    return true;
  } catch {
    return false;
  }
}

function handleOnClick(
  data: { latE6?: number; lngE6?: number },
  viewer: Viewer,
  container: HTMLElement,
  portalEntityManager: PortalEntityManager,
  portalLabelEntityManager: PortalLabelEntityManager,
  portalOrnamentEntityManager: PortalOrnamentEntityManager,
  portalHistoryEntityManager: PortalHistoryEntityManager,
  scoutHistoryEntityManager: ScoutHistoryEntityManager,
  tileRequestManager: TileRequestManager,
  portalDetailPaneController: PortalDetailPaneController,
  portalDetailState: PortalDetailState,
): void {
  if (data.latE6 !== undefined && data.lngE6 !== undefined) {
    const latE6 = data.latE6;
    const lngE6 = data.lngE6;
    const requestId = ++latestPortalSelectionRequest;
    const cachedSelectionPromise = selectLoadedPortal(
      viewer,
      container,
      portalEntityManager,
      portalLabelEntityManager,
      portalOrnamentEntityManager,
      portalHistoryEntityManager,
      scoutHistoryEntityManager,
      portalDetailPaneController,
      portalDetailState,
      latE6,
      lngE6,
      requestId
    );
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lngE6 / 1e6, latE6 / 1e6, 8e2),
      duration: 1.5,
      complete: () => {
        cachedSelectionPromise.then(async (selectionHandled) => {
          if (selectionHandled) return;

          // Cancel selection if there's another selection in flight
          if (requestId !== latestPortalSelectionRequest) return;

          // Explicitly request tiles here to avoid race condition
          tileRequestManager.requestTilesForCurrentView();
          await tileRequestManager.waitForIdle();

          // Cancel selection if there's another selection in flight
          if (requestId !== latestPortalSelectionRequest) return;

          await selectLoadedPortal(
            viewer,
            container,
            portalEntityManager,
            portalLabelEntityManager,
            portalOrnamentEntityManager,
            portalHistoryEntityManager,
            scoutHistoryEntityManager,
            portalDetailPaneController,
            portalDetailState,
            latE6,
            lngE6,
            requestId
          );
        });
      },
    });
  }
}

const CommMessage = ({
  message,
  viewer,
  container,
  tileRequestManager,
  portalEntityManager,
  portalLabelEntityManager,
  portalOrnamentEntityManager,
  portalHistoryEntityManager,
  scoutHistoryEntityManager,
  portalDetailPaneController,
  portalDetailState,
  channel,
}: {
  message: CommResponseItem;
  viewer: Viewer;
  container: HTMLElement;
  tileRequestManager: TileRequestManager;
  portalEntityManager: PortalEntityManager;
  portalLabelEntityManager: PortalLabelEntityManager;
  portalOrnamentEntityManager: PortalOrnamentEntityManager;
  portalHistoryEntityManager: PortalHistoryEntityManager;
  scoutHistoryEntityManager: ScoutHistoryEntityManager;
  portalDetailPaneController: PortalDetailPaneController;
  portalDetailState: PortalDetailState;
  channel: Channel;
}) => {
  const timestamp = message[1];
  const plext = message[2].plext;
  const dateObj = new Date(timestamp);
  const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ margin: "4px 0px", display: "flex", flexDirection: "row" }}>
      <div
        style={{ fontSize: "12px", color: "rgba(214, 254, 250, 0.5)", minWidth: "75px", width: "75px" }}
        title={dateObj.toLocaleString()}
      >
        {timeStr}
      </div>
      <div style={{ fontSize: "12px", paddingBottom: "2px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {plext.markup.map(([type, data]) => {
          let teamColor = "white";
          if (data.team === "ENLIGHTENED") teamColor = getTeamColor("ENLIGHTENED").toCssColorString();
          else if (data.team === "RESISTANCE") teamColor = getTeamColor("RESISTANCE").toCssColorString();
          else if (data.team === "MACHINA") teamColor = getTeamColor("MACHINA").toCssColorString();
          else if (data.team === "NEUTRAL" && data.plain === "_̶̱̍_̴̳͉̆̈́M̷͔̤͒Ą̷̍C̴̼̕ͅH̶̹͕̼̾Ḭ̵̇̾̓N̵̺͕͒̀̍Ä̴̞̰́_̴̦̀͆̓_̷̣̈́") teamColor = getTeamColor("MACHINA").toCssColorString();

          if (type === "PLAYER" || type === "SENDER") {
            return <span style={{ color: teamColor, fontWeight: "bold", marginRight: "3px" }}>{data.plain}</span>;
          } else if (type === "PORTAL") {
            return (
              <span
                style={{
                  color: plext.plextType === "SYSTEM_NARROWCAST" ? "#d8ad4c" : "#bbb",
                  cursor: "pointer",
                  textDecoration: "underline"
                }}
                onClick={() => handleOnClick(
                  data,
                  viewer,
                  container,
                  portalEntityManager,
                  portalLabelEntityManager,
                  portalOrnamentEntityManager,
                  portalHistoryEntityManager,
                  scoutHistoryEntityManager,
                  tileRequestManager,
                  portalDetailPaneController,
                  portalDetailState,
                )}
              >
                {data.plain}
              </span>
            );
          } else if (type === "SECURE") {
            if (channel === "all") {
              return <span style={{ color: "#f88" }}>{data.plain}</span>;
            } else {
              return;
            }
          } else {
            return <span style={{
              color: plext.plextType === "SYSTEM_NARROWCAST" ? "#d8ad4c" : "#fff"
            }}>
              {data.plain}
            </span>;
          }
        })}
      </div>
    </div>
  );
};

export default CommMessage;
