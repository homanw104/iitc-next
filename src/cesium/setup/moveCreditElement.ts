/**
 * Move the credit element to leave space for the bottom control bar.
 */

export function moveCreditElement(container: HTMLElement): void {
  const cesiumViewer = container.querySelector(".cesium-viewer") as HTMLElement;

  let customWrapper = cesiumViewer.querySelector(".cesium-viewer-bottom-custom-wrapper") as HTMLElement;
  if (!customWrapper) {
    customWrapper = document.createElement("div");
    customWrapper.classList.add("cesium-viewer-bottom-custom-wrapper");
    Object.assign(customWrapper.style, {
      position: "absolute",
      left: "var(--iitc-left-control-padding, 5px)",
      bottom: "calc(var(--iitc-bottom-control-padding, 5px) + 38px)",
      width: "calc(100% - var(--iitc-left-control-padding, 5px) - var(--iitc-right-control-padding, 5px) - 114px)",
    });
    cesiumViewer.appendChild(customWrapper);
  }

  const cesiumBottomBar = cesiumViewer.querySelector(".cesium-viewer-bottom") as HTMLElement;
  if (cesiumBottomBar) {
    cesiumBottomBar.remove();
    customWrapper.appendChild(cesiumBottomBar);
  }
}
