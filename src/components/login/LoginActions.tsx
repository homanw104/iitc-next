import { h } from "../../utils/dom.ts";
import LoginButton from "./LoginButton.tsx";

const SIGN_IN_URL = "https://signin.nianticspatial.com/signin?continue=https://intel.ingress.com/signinhandler&service=ingress-intel";
const LEARN_MORE_URL = "https://support.ingress.com/hc";

const LoginActions = (): HTMLElement => {
  return (
    <div
      style={{
        marginTop: "24px",
        display: "flex",
        alignContents: "center",
        flexWrap: "wrap",
        gap: "16px",
      }}
    >
      <LoginButton href={SIGN_IN_URL}>Sign in</LoginButton>
      <LoginButton href={LEARN_MORE_URL} variant="secondary">Learn More</LoginButton>
    </div>
  ) as HTMLElement;
};

export default LoginActions;
