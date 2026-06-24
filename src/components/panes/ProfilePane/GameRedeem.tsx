import type { RedeemManager } from "../../../managers/game/redeemManager.ts";
import { h, Fragment } from "../../../utils/dom.ts";

const GameRedeem = ({ redeemManager, onRedeemSuccess }: {
  redeemManager: RedeemManager,
  onRedeemSuccess: (message: string) => void,
}) => {
  return (
    <>
      <div style={{ marginTop: "20px" }}>Redeem Code</div>
      <div style={{ display: "flex", gap: "5px" }}>
        <input
          id="redeem-input"
          type="text"
          placeholder="Passcode"
          style={{
            flex: 1,
            backgroundColor: "#111",
            border: "1px solid #555",
            color: "white",
            padding: "4px 8px",
            borderRadius: "2px",
          }}
          onKeypress={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const input = document.getElementById("redeem-input") as HTMLInputElement;
              if (input.value) {
                redeemManager.requestRedeem(input.value).then((msg) => onRedeemSuccess(msg));
              }
            }
          }}
        />
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
          onClick={() => {
            const input = document.getElementById("redeem-input") as HTMLInputElement;
            if (input.value) {
              redeemManager.requestRedeem(input.value).then((msg) => onRedeemSuccess(msg));
            }
          }}
        >
          Redeem
        </button>
      </div>
    </>
  );
};

export default GameRedeem;
