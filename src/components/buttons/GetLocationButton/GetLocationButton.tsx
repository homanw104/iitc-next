import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import { h } from "../../../utils/dom.ts";
import { logManager } from "../../../managers/logManager.ts";

const GetLocationButton = ({ viewer }: {
  viewer: Cesium.Viewer,
}): HTMLElement => {
  const onclick = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const height = 1800;
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(longitude, latitude, height),
            duration: 2.4,
          });
        },
        (error) => {
          logManager.error("CesiumViewer", "Failed to get location", error);
        }
      );
    } else {
      logManager.error("CesiumViewer", "Geolocation is not supported by this browser");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(var(--iitc-bottom-control-padding, 5px) + 65px)",
        right: "calc(var(--iitc-right-control-padding, 5px) + 29px)",
        zIndex: "10000",
        display: "flex",
      }}
    >
      <button
        type="button"
        title="Get Location"
        class="cesium-button cesium-toolbar-button"
        onClick={onclick}
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
