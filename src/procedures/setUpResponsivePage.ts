/**
 * Remove predefined stylesheets and set up the viewport to be responsive.
 */

export default function setUpResponsivePage(): void {
  const head = document.head ?? document.documentElement.appendChild(document.createElement("head"));
  let viewport = head.querySelector<HTMLMetaElement>("meta[name='viewport']");
  if (!viewport) {
    viewport = document.createElement("meta");
    viewport.name = "viewport";
    head.appendChild(viewport);
  }
  viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";

  let viewportStyle = head.querySelector<HTMLStyleElement>("#iitc-next-viewport-style");
  if (!viewportStyle) {
    viewportStyle = document.createElement("style");
    viewportStyle.id = "iitc-next-viewport-style";
    head.appendChild(viewportStyle);
  }

  viewportStyle.textContent = `
    html,
    body {
      min-width: 0 !important;
      min-height: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }
  `;
}
