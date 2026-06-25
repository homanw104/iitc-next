import { h } from "../../utils/dom.ts";

const LoginButton = ({ href, variant = "primary", children }: {
  href: string,
  variant?: "primary" | "secondary",
  children?: JSX.Element[],
}): HTMLElement => {
  const isPrimary = variant === "primary";

  return (
    <a
      href={href}
      style={{
        height: "44px",
        width: "min(100%, 180px)",
        boxSizing: "border-box",
        border: `1px solid ${isPrimary ? "#59fbea" : "#499399"}`,
        padding: "11px 18px",
        background: isPrimary ? "rgba(89, 251, 234, 0.08)" : "transparent",
        color: isPrimary ? "#59fbea" : "#9ee9df",
        font: "700 12px/1.2 Open Sans, sans-serif",
        letterSpacing: 0,
        textDecoration: "none",
        textTransform: "uppercase",
        textAlign: "center",
        display: "inline-grid",
        placeItems: "center",
      }}
    >
      {children}
    </a>
  ) as HTMLElement;
};

export default LoginButton;
