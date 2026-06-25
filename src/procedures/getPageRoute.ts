/**
 * Function to determine whether we are on the login page.
 */

type PageRoute = "/signinhandler" | "/intel" | "/"

const getPageRoute = (): PageRoute | undefined => {
  if (window.location.hostname === "intel.ingress.com") {
    if (window.location.pathname === "/") return "/";
    if (window.location.pathname.startsWith("/intel")) return "/intel";
    if (window.location.pathname.startsWith("/signinhandler")) return "/signinhandler";
  }
  return undefined;
};

export default getPageRoute;
