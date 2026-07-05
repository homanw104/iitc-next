import type { RedeemResult } from "../../../managers/game/redeemManager.ts";
import { h } from "../../../utils/dom.ts";
import RedeemResultMessage from "./RedeemResultMessage.tsx";
import CloseButton from "../../atoms/CloseButton/CloseButton.tsx";

const RedeemResultPane = ({ result, onClose }: {
  result: RedeemResult,
  onClose: () => void,
}): HTMLElement => {
  const items = formatRedeemItems(result);
  const message = getRedeemMessage(result, items);

  return (
    <div style={{
      position: "absolute",
      top: "calc(var(--iitc-system-top-inset, 0px) + 41px)",
      left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
      bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 41px)",
      right: "calc(var(--iitc-system-right-inset, 0px) + 5px)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10030",
    }}>
      <div style={{
        position: "relative",
        margin: "2px 3px",
        border: "1px solid #555",
        borderRadius: "4.2px",
        padding: "12px",
        width: "400px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "calc(100% - 30px)",
        backgroundColor: "rgba(42, 42, 42, 0.9)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px", gap: "8px" }}>
          <RedeemResultMessage message={message} />
          <CloseButton onClose={onClose} />
        </div>
        {items.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "4px 10px",
          }}>
            {items.map((item) => (
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) as HTMLElement;
};

function getRedeemMessage(result: RedeemResult, items: string[]): string {
  if (!result.ok) return result.message;
  return items.length === 0 ? "Passcode redeemed successfully!" : "Passcode confirmed. Acquired items:";
}

function formatRedeemItems(result: RedeemResult): string[] {
  if (!result.ok) return [];

  const rewards = result.response.rewards;
  if (!rewards) return [];

  const items: string[] = [];

  rewards.other?.forEach((item) => {
    if (item) items.push(item);
  });

  if (rewards.xm) items.push(`${rewards.xm} XM`);
  if (rewards.ap) items.push(`${rewards.ap} AP`);

  rewards.inventory?.forEach((type) => {
    type.awards.forEach((award) => {
      const level = award.level > 0 ? `L${award.level} ` : "";
      items.push(`${level}${type.name} (${award.count})`);
    });
  });

  return items;
}

export default RedeemResultPane;
