/**
 * Creates the fixed full-screen DOM container that hosts the Cesium viewer.
 */

export function createCesiumContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.id = "cesium-container";
  container.style.setProperty(
    "--iitc-top-control-padding",
    "calc(var(--iitc-system-top-inset, 0px) + 5px)"
  );
  container.style.setProperty(
    "--iitc-right-control-padding",
    "calc(var(--iitc-system-right-inset, 0px) + 5px)"
  );
  container.style.setProperty(
    "--iitc-bottom-control-padding",
    "calc(var(--iitc-system-bottom-inset, 0px) + 5px)"
  );
  container.style.setProperty(
    "--iitc-left-control-padding",
    "calc(var(--iitc-system-left-inset, 0px) + 5px)"
  );
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "10000",
    backgroundColor: "black",
  });
  document.body.appendChild(container);

  const style = document.createElement("style");
  style.textContent = `
    #cesium-container .cesium-viewer-toolbar {
      top: var(--iitc-top-control-padding, 5px);
      right: var(--iitc-right-control-padding, 5px);
    }
  `;
  container.appendChild(style);

  return container;
}
