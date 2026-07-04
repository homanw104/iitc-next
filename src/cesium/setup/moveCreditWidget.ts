/**
 * Moves the Cesium credit widget to a custom position within the Cesium viewer.
 */

export function moveCreditWidget(container: HTMLElement): void {
  const cesiumViewer = container.querySelector<HTMLElement>(".cesium-viewer");
  if (!cesiumViewer) throw new Error("Cesium viewer element was not created");

  let customWrapper = cesiumViewer.querySelector<HTMLElement>(".cesium-viewer-bottom-custom-wrapper");
  if (!customWrapper) {
    customWrapper = document.createElement("div");
    customWrapper.classList.add("cesium-viewer-bottom-custom-wrapper");
    Object.assign(customWrapper.style, {
      position: "absolute",
      left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
      bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
      width: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 124px)",
    });
    cesiumViewer.appendChild(customWrapper);
  }

  const cesiumBottomBar = cesiumViewer.querySelector<HTMLElement>(".cesium-viewer-bottom");
  if (cesiumBottomBar) {
    cesiumBottomBar.remove();
    customWrapper.appendChild(cesiumBottomBar);
  }
}
