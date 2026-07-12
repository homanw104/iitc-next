import type { GetLocationButtonController } from "../../../controllers/GetLocationButtonController.tsx";
import { h } from "../../../utils/dom.ts";

const GetLocationButton = ({ getLocationButtonController }: {
  getLocationButtonController: GetLocationButtonController,
}): HTMLElement => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(var(--iitc-system-bottom-inset, 0px) + 70px)",
        right: "calc(var(--iitc-system-right-inset, 0px) + 34px)",
        display: "flex",
      }}
    >
      <button
        type="button"
        title="Get Location"
        class="cesium-button cesium-toolbar-button"
        onClick={() => getLocationButtonController.flyToCurrentLocation()}
        style={{
          position: "relative",
          width: "52px",
          height: "52px",
          padding: "0px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #444444",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        <svg viewBox="0 -960 960 960" width="42px" height="42px" fill="currentColor">
          <path d="M440-42v-80q-125-14-214.5-103.5T122-440H42v-80h80q14-125 103.5-214.5T440-838v-80h80v80q125 14 214.5 103.5T838-520h80v80h-80q-14 125-103.5 214.5T520-122v80h-80Zm238-240q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82Zm-311-85q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm169.5-56.5Q560-447 560-480t-23.5-56.5Q513-560 480-560t-56.5 23.5Q400-513 400-480t23.5 56.5Q447-400 480-400t56.5-23.5ZM480-480Z" />
        </svg>
      </button>
    </div>
  ) as HTMLElement;
};

export default GetLocationButton;
