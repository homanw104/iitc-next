import { h } from "../../../utils/dom.ts";

const RedeemResultMessage = ({ message }: { message: string }) => {
  return (
    <div style={{
      height: "36px",
      display: "flex",
      alignItems: "center",
      minWidth: 0,
      flex: 1,
    }}>
      <span style={{
        textOverflow: "ellipsis",
        overflow: "hidden",
        whiteSpace: "nowrap",
        display: "block",
        width: "100%",
      }}>
        {message}
      </span>
    </div>
  );
};

export default RedeemResultMessage;
