# Architecture

IITC Next is a Vite-built TypeScript userscript, with Capacitor shells for
Android and iOS. The web runtime is injected into `https://intel.ingress.com/`
and replaces the stock Intel map with a full-screen Cesium viewer.

The userscript entry starts in `src/bootstrap.ts`, which installs the vanilla
Intel blocker before dynamically importing normal app code from `src/app.ts`.
The main boot flow in `src/app.ts`:

* Initialize safe storage and the `window.iitc` integration object.
* Set up the log manager, API request manager, settings manager, and player info
  manager. API setup extracts or restores the Ingress API version used by
  `/r/...` requests.
* If the user is logged in, create the Cesium viewer, core managers, UI
  controllers, plugins, and splash-screen lifecycle.

`src/procedures/` contains this startup orchestration. Keep most one-time
application wiring there instead of hiding it in constructors.

`src/cesium/setup/` contains Cesium-specific runtime wiring:

* `createBaseLayersViewModels.ts` assembles the base imagery options used by
  Cesium's base layer picker.
* `createCesiumViewer.ts` creates the viewer, configures Cesium assets and Ion,
  applies scene defaults, and optionally enables Google Photorealistic 3D Tiles.
* `createCoreManagers.ts` constructs the manager graph, while
  `exposeCoreManagers.ts` publishes those managers to `window.iitc` for plugins.
* `mountCoreControllersAndUI.ts` mounts the built-in UI buttons and panes, and
  keeps the portal detail bar connected to log and portal-selection state.
* The remaining setup helpers restore camera state, configure controls, connect
  interaction handlers, refresh terrain-backed entity positions, and wire tile
  request status into debug tile rendering.

`src/managers/` is the main domain/runtime layer and is grouped by concern:

* `tiles/` owns view-to-tile calculation, request queueing, raw tile parsing,
  entity hydration, and the `TileRequestManager` facade.
* `entity/` owns Cesium entities for portals, labels, ornaments, history
  halos, scout-control halos, links, fields, debug tiles, shared terrain
  positions, and translucency.
* `layer/` owns Cesium data sources, overlay data sources, visibility filters,
  plugin layer registration, and persisted layer state.
* `comm/` wraps Ingress comm API state and requests.
* `game/` wraps player info, scoreboard data, and passcode redemption.
* `system/` contains app-wide managers for API requests, logs, settings,
  plugins, scene readiness, and plugin-facing interface mounting.

`src/cesium/` is Cesium-specific infrastructure. `global/` holds global Cesium
typing, `imagery/` implements custom imagery providers, `layer/` defines base
layer provider models, `setup/` wires the runtime together, and `interaction/`
contains the custom touch, pinch, camera, and portal-selection logic. Some
Cesium integration uses private/internal Cesium structures, especially overlay
rendering in `LayerManager`; touch those paths carefully and verify on real
rendering paths.

`src/components/` and `src/controllers/` implement the UI without React at
runtime. TSX is compiled through the custom JSX factory in `src/utils/dom.ts`,
which returns real DOM nodes. Components are mostly pure DOM factories;
controllers hold DOM references, pane state, callbacks, and re-render by
replacing nodes.

`src/plugins/` contains built-in plugins registered during startup from
`registerPlugins.ts`. Plugins implement the `IITCPlugin` interface, wait for
`window.iitc.pluginManager`, then use exposed managers such as `viewer`,
`layerManager`, `interfaceManager`, `commManager`, and `entityPositionManager`.
Plugins should clean up data sources, overlays, event handlers, timers, and DOM
nodes in `deinit`.

`src/utils/` contains browser, DOM, storage, map-coordinate, text, window, and
color helpers. `safeLocalStorage` bridges normal `localStorage`, in-memory
fallback storage, and Capacitor Preferences on native platforms.

The native shells in `android/` and `ios/` load the built userscript into a
WebView/WKWebView, provide Cesium/SystemJS injection fallbacks, handle login
popups, publish safe-area insets as CSS variables, and bridge native features
such as geolocation and file sharing back into JavaScript.

Build-related files:

* `vite.config.ts` builds the main userscript with Cesium loaded from CDN.
* `vite.plugin.config.ts` and `scripts/build-plugins.ts` build plugins as
  separate userscripts.
* `scripts/sync-version.ts` keeps package, native project, README, and native
  script-injector Cesium versions in sync.
