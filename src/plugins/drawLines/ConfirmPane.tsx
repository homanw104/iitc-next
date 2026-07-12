import { h } from "../../utils/dom.ts";

export const ConfirmPane = ({ msg, onConfirm, onCancel }: {
  msg: string;
  onConfirm: () => void;
  onCancel: () => void;
}): HTMLElement => {
  return (
    <div style={{
      position: "absolute",
      top: "var(--iitc-system-top-inset, 0px)",
      left: "var(--iitc-system-left-inset, 0px)",
      bottom: "var(--iitc-system-bottom-inset, 0px)",
      right: "var(--iitc-system-right-inset, 0px)",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10040",
    }}>
      <div style={{
        position: "relative",
        width: "250px",
        height: "100px",
        padding: "12px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 32px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        border: "1px solid #555",
        borderRadius: "4.2px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: "100%",
          flexGrow: 1,
        }}>
          {msg}
        </div>
        <div style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "8px",
        }}>
          <button
            style={{
              backgroundColor: "#5091ff",
              border: "1px solid #555",
              color: "white",
              height: "34px",
              padding: "4px 8px",
              borderRadius: "2px",
              fontFamily: "coda_regular, arial, helvetica, sans-serif",
              cursor: "pointer",
            }}
            onClick={() => onConfirm()}
          >
            Confirm
          </button>
          <button
            style={{
              backgroundColor: "#5091ff",
              border: "1px solid #555",
              color: "white",
              height: "34px",
              padding: "4px 8px",
              borderRadius: "2px",
              fontFamily: "coda_regular, arial, helvetica, sans-serif",
              cursor: "pointer",
            }}
            onClick={() => onCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) as HTMLElement;
};
