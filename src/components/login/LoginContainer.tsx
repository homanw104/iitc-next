import { h } from "../../utils/dom.ts";
import SplashDivider from "../splash/SplashDivider.tsx";
import SplashTitle from "../splash/SplashTitle.tsx";
import LoginContent from "./LoginContent.tsx";

const LoginContainer = (): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        left: "calc(var(--iitc-system-left-inset, 0px) + 25px)",
        right: "calc(var(--iitc-system-right-inset, 0px) + 25px)",
        top: "calc(var(--iitc-system-top-inset, 0px) + 70px)",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 70px)",
        border: "1px solid #499399",
        padding: "40px",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        overflow: "hidden",
      }}
    >
      <SplashTitle />
      <SplashDivider />
      <LoginContent />
    </div>
  ) as HTMLElement;
};

export default LoginContainer;
