import { h } from "../../../utils/dom.ts";

const AboutDetailButtonBar = () => {
  return (
    <div style={{ marginTop: "20px", marginBottom: "10px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ display: "flex", gap: "12px" }}>
        <a
          id="github"
          style={{
            color: "#6088ff",
            cursor: "pointer",
          }}
          href="https://github.com/homanw104/iitc-next"
          target="_blank"
        >
          GitHub
        </a>
        <a
          id="changelog"
          style={{
            color: "#6088ff",
            cursor: "pointer",
          }}
          href="https://github.com/homanw104/iitc-next/blob/main/CHANGELOG.md"
          target="_blank"
        >
          Changelog
        </a>
      </div>
      <a
        id="website"
        style={{
          color: "#6088ff",
          cursor: "pointer",
        }}
        href="https://iitcnext.homans.world"
        target="_blank"
      >
        Website
      </a>
    </div>
  );
};

export default AboutDetailButtonBar;
