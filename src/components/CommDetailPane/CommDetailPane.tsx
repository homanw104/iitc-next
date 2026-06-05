import { Viewer } from "cesium";
import { h } from "../../utils/dom";
import { Channel } from "../../types/ingress";
import { CommManager } from "../../managers/commManager";
import CommSendButton from "./CommSendButton";
import CommCloseButton from "./CommCloseButton";
import CommTextInput from "./CommTextInput";
import CommFetchLatestButton from "./CommFetchLatestButton";
import CommLoadingIndicator from "./CommLoadingIndicator";
import CommMessage from "./CommMessage";
import CommTab from "./CommTab";

const CommDetailPane = ({
  viewer,
  commManager,
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
  const messages = commManager.getMessages(channel);
  let textInput: HTMLInputElement | null = null;

  const tabs: { id: Channel; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "faction", label: "FACTION" },
    { id: "alerts", label: "ALERTS" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: "41px",
        right: "5px",
        margin: "2px 3px",
        width: "600px",
        height: "500px",
        maxWidth: "calc(100% - 18px - 24px)",
        maxHeight: "calc(100% - 16px - 24px)",
        display: "flex",
        flexDirection: "column",
        padding: "12px",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        zIndex: "10015",
      }}
    >
      <div
        className="comm-tabs"
        style={{
          display: "flex",
          alignItems: "center",
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
          {messages.map((plext) => (
            <CommMessage plext={plext} viewer={viewer} channel={channel} />
          ))}
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

export default CommDetailPane;
