import { h } from "../../utils/dom";

const LayerSection = ({ name }: { name: string }) => (
  <div
    style={{
      marginTop: "10px",
      marginBottom: "5px",
      fontWeight: "bold",
      fontSize: "10px",
      color: "#aaa",
      textTransform: "uppercase",
      letterSpacing: "1px",
    }}
  >
    {name}
  </div>
);

export default LayerSection;
