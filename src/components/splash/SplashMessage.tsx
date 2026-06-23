import { h } from "../../utils/dom.ts";
import { LogEntry } from "../../managers/logManager.ts";

const SplashMessage = ({ logEntry }: {
  logEntry: LogEntry,
}): HTMLElement => {
  return (
    <div style={{ width: "100%", minHeight: "0" }}>
      <pre style={{ margin: 0, paddingLeft: "2em", textIndent: "-2em", whiteSpace: "pre-wrap" }}>
        [{logEntry.tag}] {logEntry.args.join(" ")}
      </pre>
    </div>
  ) as HTMLElement;
};

export default SplashMessage;
