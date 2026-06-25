import { h } from "../../utils/dom.ts";
import LoginActions from "./LoginActions.tsx";

const LoginContent = (): HTMLElement => {
  return (
    <main
      style={{
        marginTop: "60px",
        display: "flex",
        flexDirection: "column",
        alignContent: "center",
        justifyItems: "start",
        gap: "30px",
      }}
    >
      <h1
        style={{
          margin: 0,
          color: "#59fbea",
          fontFamily: "Open Sans, sans-serif",
          fontSize: "24px",
          lineHeight: 1.2,
          fontWeight: "500",
        }}
      >
        Welcome to Ingress!
      </h1>
      <LoginActions />
    </main>
  ) as HTMLElement;
};

export default LoginContent;
