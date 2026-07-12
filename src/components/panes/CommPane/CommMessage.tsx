import * as Cesium from "cesium";
import type { Viewer } from "cesium";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../../cesium/setup/mountCoreControllersAndUI.ts";
import type { PortalManager } from "../../../managers/entity/portalManager.ts";
import type { PortalHistoryManager } from "../../../managers/entity/portalHistoryManager.ts";
import type { PortalLabelManager } from "../../../managers/entity/portalLabelManager.ts";
import type { PortalOrnamentManager } from "../../../managers/entity/portalOrnamentManager.ts";
import type { ScoutHistoryManager } from "../../../managers/entity/scoutHistoryManager.ts";
import type { TileRequestManager } from "../../../managers/tiles/tileRequestManager.ts";
import type { Channel } from "../../../types/common/common.ts";
import type { CommResponseItem } from "../../../types/api/getPlexts.ts";
import { getTeamColor } from "../../../utils/color.ts";
import { h } from "../../../utils/dom.ts";
import PortalDetailBar from "../../buttons/PortalDetailBar/PortalDetailBar.tsx";

let latestPortalSelectionRequest = 0;

async function selectLoadedPortal(
  viewer: Viewer,
  container: HTMLElement,
  portalManager: PortalManager,
  portalLabelManager: PortalLabelManager,
  portalOrnamentManager: PortalOrnamentManager,
  portalHistoryManager: PortalHistoryManager,
  scoutHistoryManager: ScoutHistoryManager,
  portalDetailPaneController: PortalDetailPaneController,
  portalDetailState: PortalDetailState,
  latE6: number,
  lngE6: number,
  requestId: number,
): Promise<boolean> {
  try {
    const portalData = portalManager.getPortalDataByCoordinates(latE6, lngE6);
    if (!portalData) return false;

    const portalGuid = portalData.guid;
    viewer.selectedEntity = portalManager.getPortalEntity(portalGuid);

    await portalManager.requestPortalDetails(portalGuid);
    if (requestId !== latestPortalSelectionRequest) return true;

    const freshData = portalManager.getPortalData(portalGuid);
    if (!freshData) return false;

    portalDetailState.lastPortalData = freshData;
    portalDetailState.portalDetailBar?.remove();
    portalDetailState.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailPaneController: portalDetailPaneController, data: freshData }));
    portalDetailPaneController.updateDetailPane(freshData);
    await portalLabelManager.addOrUpdateLabel(freshData);
    await portalOrnamentManager.addOrUpdateOrnament(freshData);
    await portalHistoryManager.addOrUpdateHistoryHalo(freshData);
    await scoutHistoryManager.addOrUpdateScoutControlHalo(freshData);
    return true;
  } catch {
    return false;
  }
}

function handleOnClick(
  data: { latE6?: number; lngE6?: number },
  viewer: Viewer,
  container: HTMLElement,
  portalManager: PortalManager,
  portalLabelManager: PortalLabelManager,
  portalOrnamentManager: PortalOrnamentManager,
  portalHistoryManager: PortalHistoryManager,
  scoutHistoryManager: ScoutHistoryManager,
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
      portalManager,
      portalLabelManager,
      portalOrnamentManager,
      portalHistoryManager,
      scoutHistoryManager,
      portalDetailPaneController,
      portalDetailState,
      latE6,
      lngE6,
      requestId,
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
            portalManager,
            portalLabelManager,
            portalOrnamentManager,
            portalHistoryManager,
            scoutHistoryManager,
            portalDetailPaneController,
            portalDetailState,
            latE6,
            lngE6,
            requestId,
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
  portalManager,
  portalLabelManager,
  portalOrnamentManager,
  portalHistoryManager,
  scoutHistoryManager,
  portalDetailPaneController,
  portalDetailState,
  channel,
}: {
  message: CommResponseItem;
  viewer: Viewer;
  container: HTMLElement;
  tileRequestManager: TileRequestManager;
  portalManager: PortalManager;
  portalLabelManager: PortalLabelManager;
  portalOrnamentManager: PortalOrnamentManager;
  portalHistoryManager: PortalHistoryManager;
  scoutHistoryManager: ScoutHistoryManager;
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
                  textDecoration: "underline",
                }}
                onClick={() => handleOnClick(
                  data,
                  viewer,
                  container,
                  portalManager,
                  portalLabelManager,
                  portalOrnamentManager,
                  portalHistoryManager,
                  scoutHistoryManager,
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
              color: plext.plextType === "SYSTEM_NARROWCAST" ? "#d8ad4c" : "#fff",
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
