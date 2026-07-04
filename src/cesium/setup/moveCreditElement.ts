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
      left: "calc(var(--iitc-system-left-inset, 0px) + 5px)",
      bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 43px)",
      width: "calc(100% - var(--iitc-system-left-inset, 0px) - var(--iitc-system-right-inset, 0px) - 124px)",
    });
    cesiumViewer.appendChild(customWrapper);
  }

  const cesiumBottomBar = cesiumViewer.querySelector(".cesium-viewer-bottom") as HTMLElement;
  if (cesiumBottomBar) {
    cesiumBottomBar.remove();
    customWrapper.appendChild(cesiumBottomBar);
  }
}
