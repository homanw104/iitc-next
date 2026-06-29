/**
 * Function to determine whether we are on the login page.
 */

type PageRoute = "/signinhandler" | "/intel" | "/"

export default function getPageRoute(): PageRoute | undefined {
  if (window.location.hostname === "intel.ingress.com") {
    if (window.location.pathname === "/") return "/";
    if (window.location.pathname.startsWith("/intel")) return "/intel";
    if (window.location.pathname.startsWith("/signinhandler")) return "/signinhandler";
  }
  return undefined;
};
