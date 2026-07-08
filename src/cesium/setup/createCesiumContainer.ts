/**
 * Creates the fixed full-screen DOM container that hosts the Cesium viewer.
 */

export function createCesiumContainer(): HTMLDivElement {
  // Create a fixed full-screen container for the Cesium viewer
  const container = document.createElement("div");
  container.id = "cesium-container";
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

  // Create a <style> element if it doesn't exist
  let cesiumStyle = container.querySelector<HTMLStyleElement>("#iitc-next-cesium-style");
  if (!cesiumStyle) {
    cesiumStyle = document.createElement("style");
    cesiumStyle.id = "iitc-next-cesium-style";
    container.appendChild(cesiumStyle);
  }

  // Set the CSS rules for the Cesium viewer
  cesiumStyle.textContent = `
    .cesium-credit-wrapper:has(a[href="https://cesium.com/pricing/"]),
    .cesium-credit-wrapper:has(a[href="https://cesium.com/pricing/"])
      + .cesium-credit-delimiter {
      display: none !important;
    }
    
    .cesium-credit-wrapper:has(a[href="https://cesium.com/pricing/"])
      + .cesium-credit-delimiter
      + .cesium-credit-wrapper {
      padding-left: 5px;
    }

    #cesium-container .cesium-viewer-toolbar {
      top: calc(var(--iitc-system-top-inset, 0px) + 5px);
      right: calc(var(--iitc-system-right-inset, 0px) + 5px);
    }

    #cesium-container .cesium-baseLayerPicker-dropDown {
      max-height: calc(100vh - var(--iitc-system-top-inset, 0px) - var(--iitc-system-bottom-inset, 0px) - 106px) !important;
      z-index: 10010;
    }
    
    #cesium-container .cesium-credit-lightbox-mobile {
      padding-top: var(--iitc-system-top-inset, 0px);
      padding-right: var(--iitc-system-right-inset, 0px);
      padding-bottom: var(--iitc-system-bottom-inset, 0px);
      padding-left: var(--iitc-system-left-inset, 0px);
      position: absolute;
      inset: 0px;
      height: auto !important;
      width: auto !important;
    }
    
    #cesium-container .cesium-credit-lightbox-mobile .cesium-credit-lightbox-close {
      top: calc(var(--iitc-system-top-inset, 0px) + 6px) !important;
      right: calc(var(--iitc-system-right-inset, 0px) + 11px) !important;
    }
  `;

  return container;
}
