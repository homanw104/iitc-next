import { h } from "../../../utils/dom.ts";

const CommTextInput = ({ onRef, onSend, onFocus, onBlur }: {
  onRef?: (el: HTMLInputElement) => void;
  onSend: (message: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) => (
  <input
    id="broadcast-input"
    ref={onRef}
    type="text"
    placeholder="Broadcast message"
    onFocus={onFocus}
    onBlur={onBlur}
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
        e.preventDefault();
        const input = e.target as HTMLInputElement;
        if (input.value) {
          onSend(input.value);
        }
      }
    }}
  />
);

export default CommTextInput;
