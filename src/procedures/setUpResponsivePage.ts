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
}
