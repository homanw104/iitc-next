import { h } from "../../utils/dom.ts";
import LoginContainer from "./LoginContainer.tsx";

const LoginScreen = (): HTMLElement => {
  return (
    <div
      id="iitc-next-login-screen"
      style={{
        position: "fixed",
        inset: "0px",
        padding: "0px",
        zIndex: 2147483647,
        background: "#0b0c0c",
        fontFamily: "coda_regular, arial, helvetica, sans-serif",
        fontSize: "12px",
        lineHeight: 1.55,
        letterSpacing: 0,
        pointerEvents: "auto",
        color: "#59fbea",
      }}
    >
      <LoginContainer />
    </div>
  ) as HTMLElement;
};

export default LoginScreen;
