import type { Viewer } from "cesium";
import type { PortalDetailPaneController } from "../../../controllers/PortalDetailPaneController.tsx";
import type { PortalDetailState } from "../../../cesium/setup/mountCoreControllersAndUI.ts";
import type { CommManager } from "../../../managers/comm/commManager.ts";
import type { PortalManager } from "../../../managers/entity/portalManager.ts";
import type { PortalHistoryManager } from "../../../managers/entity/portalHistoryManager.ts";
import type { PortalLabelManager } from "../../../managers/entity/portalLabelManager.ts";
import type { PortalOrnamentManager } from "../../../managers/entity/portalOrnamentManager.ts";
import type { ScoutHistoryManager } from "../../../managers/entity/scoutHistoryManager.ts";
import type { TileRequestManager } from "../../../managers/tiles/tileRequestManager.ts";
import type { Channel } from "../../../types/common/common.ts";
import { h } from "../../../utils/dom.ts";
import CommCloseButton from "./CommCloseButton.tsx";
import CommDateDivider from "./CommDateDivider.tsx";
import CommFetchLatestButton from "./CommFetchLatestButton.tsx";
import CommLoadingIndicator from "./CommLoadingIndicator.tsx";
import CommMessage from "./CommMessage.tsx";
import CommSendButton from "./CommSendButton.tsx";
import CommTab from "./CommTab.tsx";
import CommTextInput from "./CommTextInput.tsx";

const CommPane = ({
  viewer,
  commManager,
  tileRequestManager,
  portalManager,
  portalLabelManager,
  portalOrnamentManager,
  portalHistoryManager,
  scoutHistoryManager,
  portalDetailPaneController,
  portalDetailState,
  container,
  channel,
  isFetchingNew,
  onTabClick,
  onCloseClick,
  onFetchLatestClick,
  onSendMessage,
  onInputFocus,
  onInputBlur,
  onLoadingDivRef,
  onMessageDivsRef,
  onScroll,
}: {
  viewer: Viewer;
  commManager: CommManager;
  tileRequestManager: TileRequestManager;
  portalManager: PortalManager;
  portalLabelManager: PortalLabelManager;
  portalOrnamentManager: PortalOrnamentManager;
  portalHistoryManager: PortalHistoryManager;
  scoutHistoryManager: ScoutHistoryManager;
  portalDetailPaneController: PortalDetailPaneController;
  portalDetailState: PortalDetailState;
  container: HTMLElement;
  channel: Channel;
  isFetchingNew: boolean;
  onTabClick: (tab: Channel) => void;
  onCloseClick: () => void;
  onFetchLatestClick: () => void;
  onSendMessage: (message: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onLoadingDivRef: (el: HTMLElement) => void;
  onMessageDivsRef: (el: HTMLElement) => void;
  onScroll: (e: Event) => void;
}) => {
  let textInput: HTMLInputElement | null = null;
  let lastDateStr: string | null = null;

  const messages = commManager.getMessages(channel);
  const messageList: JSX.Element[] = [];

  for (const message of messages) {
    const dateStr = new Date(message[1]).toLocaleDateString([], { day: "numeric", month: "short" });
    if (dateStr !== lastDateStr) {
      messageList.push(
        <CommDateDivider timeStr={dateStr} />,
      );
    }
    lastDateStr = dateStr;

    messageList.push(
      <CommMessage
        message={message}
        viewer={viewer}
        tileRequestManager={tileRequestManager}
        portalManager={portalManager}
        portalLabelManager={portalLabelManager}
        portalOrnamentManager={portalOrnamentManager}
        portalHistoryManager={portalHistoryManager}
        scoutHistoryManager={scoutHistoryManager}
        portalDetailPaneController={portalDetailPaneController}
        portalDetailState={portalDetailState}
        container={container}
        channel={channel}
      />,
    );
  }

  const tabs: { id: Channel; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "faction", label: "FACTION" },
    { id: "alerts", label: "ALERTS" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
        right: "calc(var(--iitc-system-right-inset, 0px) + 5px)",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "600px",
        height: "500px",

        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding
        maxWidth: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 42px)",
        // 100% - 2 * right - 2 * margin - 2 * boarder - 2 * padding - 2 * button - 2 * margin compensate
        maxHeight: "calc(100% - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 116px)",

        display: "flex",
        flexDirection: "column",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        zIndex: "10015",
      }}
    >
      <div
        className="comm-tabs"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          borderBottom: "1px solid #555",
        }}
      >
        <div style={{ display: "flex", gap: "10px" }}>
          {tabs.map((tab) => (
            <CommTab
              id={tab.id}
              label={tab.label}
              isActive={channel === tab.id}
              onClick={onTabClick}
            />
          ))}
        </div>
        <CommCloseButton onClick={onCloseClick} />
      </div>
      <div
        ref={onMessageDivsRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: "auto", paddingRight: "5px", position: "relative" }}
      >
        <CommLoadingIndicator onRef={onLoadingDivRef} />
        <div style={{ minHeight: "100%" }}>
          {messageList}
        </div>
        <CommFetchLatestButton
          onClick={onFetchLatestClick}
          isLoading={isFetchingNew}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", height: "8px", borderTop: "1px solid #555" }} />
      <form
        onSubmit={(e: Event) => e.preventDefault()}
        style={{ display: "flex", gap: "8px" }}
      >
        <CommTextInput
          onRef={(el) => (textInput = el)}
          onSend={onSendMessage}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
        />
        <CommSendButton onClick={() => {
          if (textInput && textInput.value) {
            onSendMessage(textInput.value);
            textInput.value = "";
          }
        }} />
      </form>
    </div>
  ) as HTMLElement;
};

export default CommPane;
