import { h } from "../../utils/dom.ts";
import SplashDivider from "../splash/SplashDivider.tsx";
import SplashTitle from "../splash/SplashTitle.tsx";
import LoginContent from "./LoginContent.tsx";

const LoginContainer = (): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        left: "calc(var(--iitc-left-control-padding, 0px) + 20px)",
        right: "calc(var(--iitc-right-control-padding, 0px) + 20px)",
        top: "calc(var(--iitc-top-control-padding, 0px) + 65px)",
        bottom: "calc(var(--iitc-bottom-control-padding, 0px) + 65px)",
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
