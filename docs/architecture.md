# Architecture

IITC Next is a Vite-built TypeScript userscript, with Capacitor shells for
Android and iOS. The web runtime is injected into `https://intel.ingress.com/`
and replaces the stock Intel map with a full-screen Cesium viewer.

The main boot flow starts in `src/app.ts`:

* Initialize safe storage and the `window.iitc` integration object.
* Set up global singleton managers for logs, settings, and player info.
* Extract the Ingress API version used by `/r/...` requests.
* If the user is logged in, create the Cesium viewer, core managers, UI
  controllers, plugins, and splash-screen lifecycle.

`src/procedures/` contains this startup orchestration. Keep most one-time
application wiring there instead of hiding it in constructors.

`src/core/` creates and exposes the core runtime:

* `coreManagers.ts` constructs the manager graph and publishes it to
  `window.iitc` for plugins.
* `coreControllers.ts` mounts the built-in UI buttons and panes, and keeps the
  portal detail bar connected to log and portal-selection state.

`src/managers/` is the main domain/runtime layer and is grouped by concern:

* `tiles/` owns view-to-tile calculation, request queueing, raw tile parsing,
  entity hydration, and the `TileRequestManager` facade.
* `entities/` owns Cesium entities for portals, labels, ornaments, history
  halos, scout-control halos, links, fields, debug tiles, shared terrain
  positions, and translucency.
* `layers/` owns Cesium data sources, overlay data sources, visibility filters,
  plugin layer registration, and persisted layer state.
* `comm/` wraps Ingress comm API state and requests.
* `game/` wraps player info, scoreboard data, and passcode redemption.
* `system/` contains app-wide managers for logs, settings, plugins, scene
  readiness, and plugin-facing interface mounting.

`src/cesium/` is Cesium-specific infrastructure. `setup/` creates the viewer,
restores the last map position, configures camera controls, refreshes entity
heights, and wires tile loading to camera movement. `interaction/` contains the
custom touch, pinch, camera, and portal-selection logic. Some Cesium integration
uses private/internal Cesium structures, especially overlay rendering in
`LayerManager`; touch those paths carefully and verify on real rendering paths.

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

`src/utils/` contains browser, DOM, storage, network, map-coordinate, text, and
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
