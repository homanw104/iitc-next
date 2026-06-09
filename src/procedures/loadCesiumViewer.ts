/**
 * Load the Cesium library and initialize a Viewer.
 */

import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { Cartesian3, ScreenSpaceEventType } from "cesium";
import { IITCCore } from "../types/iitc";
import { PortalData } from "../types/ingress";
import { getMapPosition } from "../utils/browser";
import { AmapMercatorTilingScheme } from "../utils/map";
import { calculateTileKeys, HEIGHT_AT_ZOOM_ZERO } from "../utils/viewer";
import { safeWindow } from "../utils/window";
import { logManager } from "../managers/logManager";
import { LayerManager } from "../managers/layerManager";
import { TileRequestManager } from "../managers/tileRequestManager";
import { DebugTileEntityManager } from "../managers/debugTileEntityManager";
import { CommManager } from "../managers/commManager";
import { ScoreManager } from "../managers/scoreManager";
import { RedeemManager } from "../managers/redeemManager";
import { getPortalLayerId, PortalEntityManager } from "../managers/portalEntityManager";
import { LinkEntityManager } from "../managers/linkEntityManager";
import { FieldEntityManager } from "../managers/fieldEntityManager";
import { PortalHistoryEntityManager } from "../managers/portalHistoryEntityManager";
import { ScoutHistoryEntityManager } from "../managers/scoutHistoryEntityManager";
import { InterfaceManager } from "../managers/interfaceManager";
import GameDetailButton from "../components/GameDetailButton/GameDetailButton";
import GetLocationButton from "../components/GetLocationButton/GetLocationButton";
import SoftRefreshButton from "../components/SoftRefreshButton/SoftRefreshButton";
import CommDetailButton from "../components/CommDetailButton/CommDetailButton";
import LayerChooserButton from "../components/LayerChooserButton/LayerChooserButton";
import PortalDetailBar from "../components/PortalDetailBar/PortalDetailBar";
import { CommDetailPaneUI } from "../interface/CommDetailPaneUI";
import { GameDetailPaneUI } from "../interface/GameDetailPaneUI";
import { PortalDetailPaneUI } from "../interface/PortalDetailPaneUI";
import { SoftRefreshUI } from "../interface/SoftRefreshUI";
import { LayerChooserPaneUI } from "../interface/LayerChooserPaneUI";

// Tell Cesium where to find its assets (Images, Workers, etc.)
// Since we use the CDN for the main library, we should also use it for assets.
// @ts-expect-error - CESIUM_BASE_URL is a global config variable for Cesium
window.CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.142.0/Build/Cesium/";

// Default access token restricted to https://intel.ingress.com
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGViN2YzNC1hYzgyLTQ2ZTQtYTEyMS0wZGYwOTY2ZWJiMzEiLCJpZCI6NDM1NTgyLCJzdWIiOiJob21hbncxMDQiLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoiSUlUQyBOZXh0IiwiaWF0IjoxNzc5NTY3OTg4fQ.YBXp3trSarnjwb9R2G5sU57DC0VbI0iCJrZv7TyuZFk";

// Storage key to save the base layer info
const BASE_LAYER_STORAGE_KEY = "iitc-next-base-layer";

// Double tap threshold
const DOUBLE_TAP_THRESHOLD = 300; // ms

function createCesiumContainer(): HTMLDivElement {
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
  return container;
}

function initCesiumViewer(container: string): Cesium.Viewer {
  const gaodeSatelliteViewModel = new Cesium.ProviderViewModel({
    name: "Gaode Satellite",
    iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingAerial.png"),
    tooltip: "Gaode Satellite Imagery",
    category: "Gaode",
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}",
        tilingScheme: new AmapMercatorTilingScheme({}),
        minimumLevel: 1,
        maximumLevel: 20,
        credit: new Cesium.Credit("Gaode", true)
      });
    }
  });

  const gaodeRoadViewModel = new Cesium.ProviderViewModel({
    name: "Gaode Road",
    iconUrl: Cesium.buildModuleUrl("Widgets/Images/ImageryProviders/bingRoads.png"),
    tooltip: "Gaode Road Map",
    category: "Gaode",
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
        tilingScheme: new AmapMercatorTilingScheme({}),
        minimumLevel: 1,
        maximumLevel: 20,
        credit: new Cesium.Credit("Gaode", true)
      });
    }
  });

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  // Remove unused imagery layer options
  const models = viewer.baseLayerPicker.viewModel.imageryProviderViewModels;
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = models.filter((model) => {
    return model.name !== "Sentinel-2" &&
      model.name !== "Blue Marble" &&
      model.name !== "Earth at night" &&
      model.name !== "Azure Maps Aerial" &&
      model.name !== "Azure Maps Roads" &&
      model.name !== "Esri World Ocean" &&
      !model.name.startsWith("Stadia");
  });

  // Add Gaode imagery options to the base layer picker
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels.unshift(gaodeSatelliteViewModel, gaodeRoadViewModel);

  // Constraint the tilt angle
  const controller = viewer.scene.screenSpaceCameraController;
  controller.maximumTiltAngle = Cesium.Math.toRadians(35);

  // Set available tilt event types
  controller.tiltEventTypes = [
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.RIGHT_DRAG,
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.CTRL,
    },
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.SHIFT,
    },
  ];

  // Force Cesium to load higher resolution tiles sooner,
  // which may bypass broken intermediate KTX2 levels on mobile
  viewer.scene.globe.maximumScreenSpaceError = 1.5;

  // Other options for the camera and scene to improve visual quality and performance
  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;
  viewer.scene.highDynamicRange = true;
  viewer.scene.msaaSamples = 4;
  viewer.resolutionScale = 2.0;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // Remove the credits widget
  const credits = document.querySelector(".cesium-widget-credits") as HTMLElement;
  if (credits) {
    credits.style.display = "none";
  }

  return viewer;
}

function setInitialView(viewer: Cesium.Viewer): void {
  const modelName = localStorage.getItem(BASE_LAYER_STORAGE_KEY);
  const viewModel = viewer.baseLayerPicker.viewModel.imageryProviderViewModels.find(m => m.name === modelName);
  if (viewModel) viewer.baseLayerPicker.viewModel.selectedImagery = viewModel;
  document.querySelectorAll(".cesium-baseLayerPicker-item").forEach((item) => {
    item.addEventListener("click", () => {
      localStorage.setItem(BASE_LAYER_STORAGE_KEY, viewer.baseLayerPicker.viewModel.selectedImagery.name);
    });
  });

  const pos = getMapPosition();
  if (pos) {
    const height = HEIGHT_AT_ZOOM_ZERO / Math.pow(2, pos.zoom);
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(pos.lng, pos.lat, height),
    });
  }
}

function setupInteractionHandlers(
  viewer: Cesium.Viewer,
  container: HTMLElement,
  portalDetailUI: PortalDetailPaneUI,
  layerManager: LayerManager,
  portalEntityManager: PortalEntityManager,
  portalHistoryEntityManager: PortalHistoryEntityManager,
  scoutHistoryEntityManager: ScoutHistoryEntityManager,
  state: { lastPortalData: PortalData | null; lastLogMsg: string; portalDetailBar: HTMLElement | null },
): void {
  const handler = viewer.screenSpaceEventHandler;
  const controller = viewer.scene.screenSpaceCameraController;

  let lastTapTime = 0;
  let lastMoveTime = 0;
  let zoomVelocity = 0;

  // Variable for the pinch gesture
  let isPinching = false;

  // Variable for remembering the zoom center location
  let lastTapPosition: Cesium.Cartesian2 | null = null;

  // Variable for triggering the double tap and drag to zoom
  let totalMovementLength: number = 0;

  // Variables for the double tap and drag gesture
  let isDuringTheTap = false;
  let isDuringTheSecondTap = false;
  let hasMovedDuringTheSecondTap = false;
  let momentumRequestId: number | null = null;
  let inertiaResetTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Variables for preventing loading of the previous portal when a new one is selected
  let isPortalDetailLoading = false;
  let hasCancelledDisplayPortalDetail = false;
  let lastPortalEntity: Cesium.Entity | undefined;

  // Variables for detecting double tap
  let hasJustDoubleTapped = false;
  let revertHasJustDoubleTappedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Remove default callbacks
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  // Touch start callback
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const now = Date.now();
    lastTapPosition = event.position;
    totalMovementLength = 0;
    hasMovedDuringTheSecondTap = false;
    isDuringTheTap = true;

    // Cancel all existing momentum when touch start
    if (momentumRequestId) {
      cancelAnimationFrame(momentumRequestId);
      momentumRequestId = null;
    }

    // Cancel resetting the default inertia
    if (inertiaResetTimeoutId) {
      clearTimeout(inertiaResetTimeoutId);
      inertiaResetTimeoutId = null;
    }

    // Set variables depends on whether it's double tap
    if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
      isDuringTheSecondTap = true;
      hasJustDoubleTapped = true;
      controller.enableInputs = false;  // Disable default interactions
      lastTapTime = 0;  // Reset to avoid triple tap triggering it again

      // Revert hasJustDoubleTapped after a while
      if (revertHasJustDoubleTappedTimeoutId) { clearTimeout(revertHasJustDoubleTappedTimeoutId); revertHasJustDoubleTappedTimeoutId = null; }
      revertHasJustDoubleTappedTimeoutId = setTimeout(() => hasJustDoubleTapped = false, DOUBLE_TAP_THRESHOLD * 2);
    } else {
      isDuringTheSecondTap = false;
      hasJustDoubleTapped = false;
      controller.enableInputs = true;
      lastTapTime = now;
    }

    // Pick a portal entity if available
    const pickedObjects = viewer.scene.drillPick(event.position);
    const portalEntity = pickedObjects.find(
      (o) =>
        (o.id instanceof Cesium.Entity) &&
        (o.id.id.startsWith("portal-")) &&
        (o.id as Cesium.Entity).properties?.selectable?.getValue()
    )?.id as Cesium.Entity | undefined;

    // Check if a different portal is picked during loading
    if (isPortalDetailLoading && lastPortalEntity !== portalEntity) hasCancelledDisplayPortalDetail = true;
    lastPortalEntity = portalEntity;

    if (portalEntity) {
      const portalGuid = portalEntity.id.substring(7);
      const portalData = portalEntityManager.getPortalData(portalGuid);
      if (!portalData) return;

      // Show portal data on the bar if not double-tapped
      setTimeout(() => {
        if (hasJustDoubleTapped || isDuringTheTap || isPinching) {
          // pass
        } else {
          console.log("showing details in the portal detail bar...");
          state.lastPortalData = portalData;
          state.portalDetailBar?.remove();
          state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: portalData }));
          portalDetailUI.updateDetailPane(portalData);
        }
      }, DOUBLE_TAP_THRESHOLD);

      // Request portal detail
      isPortalDetailLoading = true;
      portalEntityManager.requestPortalDetails(portalGuid).then(() => {
        // Select and display portal detail if not canceled
        setTimeout(() => {
          if (hasCancelledDisplayPortalDetail || hasJustDoubleTapped || isDuringTheTap || isPinching) {
            hasCancelledDisplayPortalDetail = false;
          } else {
            const freshData = portalEntityManager.getPortalData(portalGuid);
            if (!freshData) return;
            const layerId = getPortalLayerId(freshData);
            const source = layerManager.getOrCreateSourceAndFilter(layerId);
            viewer.selectedEntity = source.entities.getById(`portal-${portalGuid}`);
            state.lastPortalData = freshData;
            state.portalDetailBar?.remove();
            state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: freshData }));
            portalDetailUI.updateDetailPane(freshData);
            portalHistoryEntityManager.addOrUpdateHistoryHalo(freshData);
            scoutHistoryEntityManager.addOrUpdateScoutControlHalo(freshData);
          }
        }, Math.max(0, lastTapTime + DOUBLE_TAP_THRESHOLD - Date.now()));
      }).finally(() => {
        isPortalDetailLoading = false;
      });
    } else {
      // Deselect if not double-tapped
      setTimeout(() => {
        if (hasJustDoubleTapped || isDuringTheTap || isPinching) return;
        viewer.selectedEntity = undefined;
        state.lastPortalData = null;
        state.portalDetailBar?.remove();
        state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, msg: state.lastLogMsg }));
        portalDetailUI.removeDetailPane();
      }, DOUBLE_TAP_THRESHOLD);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // Drag callbacks
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!isDuringTheSecondTap) return;

    const now = Date.now();
    const dt = now - lastMoveTime;
    const dx = event.endPosition.x - event.startPosition.x;
    const dy = event.endPosition.y - event.startPosition.y;
    lastMoveTime = now;

    const movement = Math.sqrt(dx * dx + dy * dy);
    totalMovementLength  += movement;
    if (totalMovementLength > 4) hasMovedDuringTheSecondTap = true;

    // Disable momentum from default camera controller temporarily
    viewer.scene.screenSpaceCameraController.inertiaSpin = 0.0;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.0;

    // Calculate and smooth velocity (pixels per ms)
    if (dt > 0) {
      const currentVelocity = dy / dt;
      zoomVelocity = zoomVelocity * 0.4 + currentVelocity * 0.6;
    }

    // Zoom based on last tap position
    if (lastTapPosition) {
      const camera = viewer.camera;
      const height = camera.positionCartographic.height;
      const zoomFactor = height * 0.003;
      const amount = dy * zoomFactor;

      const target = camera.pickEllipsoid(lastTapPosition, viewer.scene.globe.ellipsoid);
      if (target) {
        const direction = Cesium.Cartesian3.subtract(target, camera.position, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(direction, direction);
        camera.move(direction, amount);
      }
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // Touch end callback
  handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    isDuringTheTap = false;

    if (isDuringTheSecondTap) {
      // Second tap ended
      isDuringTheSecondTap = false;

      if (!hasMovedDuringTheSecondTap) {
        // Double tap without dragging: animated zoom in
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const targetHeight = height * 0.5;
        const destination = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
        if (destination) {
          const cartographic = Cesium.Cartographic.fromCartesian(destination);
          cartographic.height = targetHeight;
          camera.flyTo({
            destination: Cesium.Cartographic.toCartesian(cartographic),
            duration: 0.5,
            complete: () => {
              controller.enableInputs = true;
            }
          });
        }
      } else if (Math.abs(zoomVelocity) > 0.1) {
        // Apply momentum if velocity is significant
        let lastFrameTime = Date.now();
        const animateMomentum = () => {
          const now = Date.now();
          const dt = now - lastFrameTime;
          lastFrameTime = now;

          if (Math.abs(zoomVelocity) < 0.01) {
            controller.enableInputs = true;
            momentumRequestId = null;
            return;
          }

          const dy = zoomVelocity * dt;
          const camera = viewer.camera;
          const height = camera.positionCartographic.height;
          const zoomFactor = height * 0.003;
          const amount = dy * zoomFactor;

          if (lastTapPosition) {
            const target = camera.pickEllipsoid(lastTapPosition, viewer.scene.globe.ellipsoid);
            if (target) {
              const direction = Cesium.Cartesian3.subtract(target, camera.position, new Cesium.Cartesian3());
              Cesium.Cartesian3.normalize(direction, direction);
              camera.move(direction, amount);
            }
          }

          // Decelerate
          zoomVelocity *= 0.92;

          momentumRequestId = requestAnimationFrame(animateMomentum);
        };
        momentumRequestId = requestAnimationFrame(animateMomentum);
      } else {
        // Dragged but no significant momentum
        controller.enableInputs = true;
      }
    } else {
      // Single tap ended
      controller.enableInputs = true;
    }

    // Restore move momentum after a while
    inertiaResetTimeoutId = setTimeout(() => {
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;       // Cesium's default
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;  // Cesium's default
      inertiaResetTimeoutId = null;
    }, 1500);
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  // Pinch related settings below
  const camera = viewer.camera;

  let pinchMode: "zoom" | "rotate" | "tilt" = "zoom";
  let totalZoomDelta = 0;
  let totalAngleDelta = 0;
  let totalHeightDelta = 0;

  const ZOOM_THRESHOLD = 5.0;     // pixels
  const ROTATE_THRESHOLD = 0.1;   // radians
  const TILT_THRESHOLD = 5.0;     // relative height delta
  const MIN_PITCH = Cesium.Math.toRadians(-90);
  const MAX_PITCH = Cesium.Math.toRadians(-60);

  // Pinch start callback
  handler.setInputAction(() => {
    isPinching = true;
    pinchMode = "zoom";
    totalZoomDelta = 0;
    totalAngleDelta = 0;
    totalHeightDelta = 0;
  }, ScreenSpaceEventType.PINCH_START);

  // Pinch move callback - handles rotation and tilting
  // @ts-expect-error - Cesium type definitions are incorrect
  handler.setInputAction((event: {
    distance: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
    angleAndHeight: { startPosition: Cesium.Cartesian2; endPosition: Cesium.Cartesian2 };
  }) => {
    // We need the internal handler to get the absolute positions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlerInternal = handler as any;
    const positions = handlerInternal._positions;
    const previousPositions = handlerInternal._previousPositions;
    const position1 = positions.values[0];
    const position2 = positions.values[1];
    const previousPosition1 = previousPositions.values[0];
    const previousPosition2 = previousPositions.values[1];

    // Calculate the center of the two fingers now and previously
    const avgPosition = { x: (position1.x + position2.x) / 2, y: (position1.y + position2.y) / 2 };
    const previousAvgPosition = { x: (previousPosition1.x + previousPosition2.x) / 2, y: (previousPosition1.y + previousPosition2.y) / 2 };

    // Calculate the midpoint we need to rotate
    const centerPosition = new Cesium.Cartesian2(
      (avgPosition.x + previousAvgPosition.x) / 2,
      (avgPosition.y + previousAvgPosition.y) / 2
    );

    // Calculate deltas
    const zoomDelta = event.distance.endPosition.y - event.distance.startPosition.y;
    let angleDelta = event.angleAndHeight.endPosition.x - event.angleAndHeight.startPosition.x;
    const heightDelta = event.angleAndHeight.endPosition.y - event.angleAndHeight.startPosition.y;

    // Clip angleDelta between -PI and PI
    if (angleDelta > Math.PI) {
      angleDelta -= 2 * Math.PI;
    } else if (angleDelta < -Math.PI) {
      angleDelta += 2 * Math.PI;
    }

    totalZoomDelta += Math.abs(zoomDelta);  // UX optimization
    totalAngleDelta += angleDelta;
    totalHeightDelta += heightDelta;

    if (pinchMode === "zoom") {
      if (Math.abs(totalZoomDelta) > ZOOM_THRESHOLD) {
        pinchMode = "zoom";
      } else if (Math.abs(totalHeightDelta) > TILT_THRESHOLD) {
        pinchMode = "tilt";
      } else if (Math.abs(totalAngleDelta) > ROTATE_THRESHOLD) {
        pinchMode = "rotate";
      }
    }

    if (pinchMode === "zoom" || pinchMode === "rotate") {
      const center = camera.pickEllipsoid(centerPosition, viewer.scene.globe.ellipsoid);

      if (center) {
        // Pan to follow midpoint movement dynamically
        const dx = avgPosition.x - previousAvgPosition.x;
        const dy = avgPosition.y - previousAvgPosition.y;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          const height = camera.positionCartographic.height;
          const pixelScale = height * 0.001;
          camera.moveRight(-dx * pixelScale);
          camera.moveUp(dy * pixelScale);
        }

        // Zoom
        const currentDistance = Cesium.Cartesian2.distance(position1, position2);
        const previousDistance = Cesium.Cartesian2.distance(previousPosition1, previousPosition2);
        const distanceDelta = currentDistance - previousDistance;

        if (Math.abs(distanceDelta) > 0) {
          const height = camera.positionCartographic.height;
          const zoomFactor = height * 0.005;
          const direction = Cesium.Cartesian3.subtract(center, camera.position, new Cesium.Cartesian3());
          Cesium.Cartesian3.normalize(direction, direction);
          camera.move(direction, distanceDelta * zoomFactor);
        }

        // Rotate
        if (pinchMode === "rotate") {
          const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          camera.lookAtTransform(transform);
          camera.rotateRight(angleDelta * 0.6);
          camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
      }
    }

    if (pinchMode === "tilt") {
      const tiltAmount = heightDelta * 0.02;
      const currentPitch = camera.pitch;

      // Cesium pitch: 0 is horizontal (looking at the horizon), -90 is looking down (-PI/2).
      // Constraint: -90 to -60 degrees from horizontal (30 degrees from vertical).

      let actualTiltAmount = tiltAmount;
      const targetPitch = currentPitch - tiltAmount; // rotateDown(tiltAmount) decreases pitch
      if (targetPitch > MAX_PITCH) {
        actualTiltAmount = currentPitch - MAX_PITCH;
      } else if (targetPitch < MIN_PITCH) {
        actualTiltAmount = currentPitch - MIN_PITCH;
      }

      if (Math.abs(actualTiltAmount) > 0) {
        const canvas = viewer.scene.canvas;
        const center = camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), viewer.scene.globe.ellipsoid);

        if (center) {
          const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
          camera.lookAtTransform(transform);
          camera.rotateDown(actualTiltAmount);
          camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
      }
    }
  }, ScreenSpaceEventType.PINCH_MOVE);

  // Pinch end callback
  handler.setInputAction(() => {
    isPinching = false;
  }, ScreenSpaceEventType.PINCH_END);
}

function setupDataLoading(viewer: Cesium.Viewer, tileRequestManager: TileRequestManager): void {
  viewer.camera.moveEnd.addEventListener(() => {
    const tileKeys = calculateTileKeys(viewer);
    if (tileKeys.length > 0) tileRequestManager.addTiles(tileKeys);
  });
}

export default function loadCesiumViewer(): void {
  logManager.debug("CesiumViewer", "Loading");

  const container = createCesiumContainer();
  const viewer = initCesiumViewer(container.id);

  setInitialView(viewer);

  const layerManager = new LayerManager(viewer);
  const portalEntityManager = new PortalEntityManager(layerManager);
  const portalHistoryEntityManager = new PortalHistoryEntityManager(layerManager);
  const scoutHistoryEntityManager = new ScoutHistoryEntityManager(layerManager);
  const linkEntityManager = new LinkEntityManager(layerManager, portalEntityManager);
  const fieldEntityManager = new FieldEntityManager(layerManager, portalEntityManager);
  const debugTileEntityManager = new DebugTileEntityManager(viewer, layerManager);
  const tileRequestManager = new TileRequestManager(viewer, portalEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, linkEntityManager, fieldEntityManager);
  const commManager = new CommManager(viewer);
  const scoreManager = new ScoreManager();
  const redeemManager = new RedeemManager();
  const interfaceManager = new InterfaceManager(container);

  tileRequestManager.onTileStatusChange((key, status) => debugTileEntityManager.updateTile(key, status));

  // Expose managers to the global iitc object
  if (safeWindow) {
    const iitc: IITCCore = safeWindow.iitc;
    iitc.viewer = viewer;
    iitc.layerManager = layerManager;
    iitc.interfaceManager = interfaceManager;
    iitc.portalEntityManager = portalEntityManager;
    iitc.linkEntityManager = linkEntityManager;
    iitc.fieldEntityManager = fieldEntityManager;
    iitc.portalHistoryEntityManager = portalHistoryEntityManager;
    iitc.scoutHistoryEntityManager = scoutHistoryEntityManager;
    iitc.tileRequestManager = tileRequestManager;
    iitc.scoreManager = scoreManager;
    iitc.redeemManager = redeemManager;
    iitc.commManager = commManager;
  }

  const portalDetailUI = new PortalDetailPaneUI(container);
  const refreshPaneUI = new SoftRefreshUI(viewer, tileRequestManager);
  const gameDetailPaneUI = new GameDetailPaneUI(container, scoreManager, redeemManager);
  const commDetailPaneUI = new CommDetailPaneUI(viewer, container, commManager);
  const layerChooserPaneUI = new LayerChooserPaneUI(container, layerManager);

  const state = {
    lastLogMsg: "Loading...",
    lastPortalData: null as PortalData | null,
    portalDetailBar: null as HTMLElement | null,
  };

  state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI }));
  container.appendChild(GetLocationButton({ viewer }));
  container.appendChild(SoftRefreshButton({ refreshPaneUI }));
  container.appendChild(CommDetailButton({ commDetailPaneUI }));
  container.appendChild(LayerChooserButton({ layerChooserPaneUI }));
  container.appendChild(GameDetailButton({ gameDetailPaneUI }));

  logManager.setCallback((msg: string) => {
    state.lastLogMsg = msg;
    state.portalDetailBar?.remove();
    
    if (state.lastPortalData) {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, data: state.lastPortalData }));
    } else {
      state.portalDetailBar = container.appendChild(PortalDetailBar({ portalDetailUI, msg: state.lastLogMsg }));
    }
  });

  setupInteractionHandlers(viewer, container, portalDetailUI, layerManager, portalEntityManager, portalHistoryEntityManager, scoutHistoryEntityManager, state);
  setupDataLoading(viewer, tileRequestManager);

  // Disable default pinch tilt and rotate
  viewer.scene.screenSpaceCameraController.enableTilt = false;
  viewer.scene.screenSpaceCameraController.enableLook = false;
  viewer.scene.screenSpaceCameraController.enableZoom = false;
  // viewer.scene.screenSpaceCameraController.enableRotate = false; // We need this for single finger pan
}
