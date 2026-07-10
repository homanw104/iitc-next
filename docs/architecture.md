# Architecture

IITC Next is a Vite-built TypeScript userscript that replaces the stock Intel
map with a Cesium viewer. Capacitor shells reuse the same runtime on Android
and iOS.

## Runtime surfaces

The web userscript is injected into `https://intel.ingress.com/`. It owns the
page after login, mounts a full-screen Cesium viewer, and exposes its core API
through `window.iitc` for built-in and separately built plugins.

The native projects in `android/` and `ios/` load that userscript in a
WebView/WKWebView. They provide Cesium/SystemJS injection fallbacks, login-popup
handling, safe-area CSS variables, and bridges for native capabilities such as
geolocation and file sharing.

## Boot and composition

### Browser bootstrap

`src/bootstrap.ts` runs first. It installs the vanilla Intel load blocker before
dynamically importing `src/app.ts`, which prevents the stock dashboard and IITC
Next from racing to initialize the page.

`src/app.ts` then:

1. Checks the page route and prevents duplicate boot.
2. Configures responsive behavior, stylesheets, and the early splash screen.
3. Initializes safe storage and the `window.iitc` integration object.
4. Sets up logging, API requests, settings, and player information.
5. Shows the login UI or loads Cesium and starts the map runtime.

One-time application wiring belongs in `src/procedures/`. Cesium-dependent
modules remain lazy until the Cesium UMD bundle is available; this is why
`startIITCNextRuntime.ts` dynamically imports viewer and plugin setup.

### Cesium runtime assembly

`loadCesiumViewer.ts` is the composition root for the map runtime. It:

1. Replaces the page body and creates the Cesium container.
2. Creates base-layer view models and the viewer.
3. Restores the previous camera and base layer.
4. Constructs the core manager graph with `createCoreManagers.ts`.
5. Publishes the viewer and managers through `window.iitc`.
6. Mounts core controllers and UI.
7. Connects camera controls, terrain refresh, picking, tile refresh, and debug
   rendering.

The remaining files in `src/cesium/setup/` are focused setup procedures rather
than service owners. Keep long-lived state and domain behavior in managers.

## Data and rendering pipeline

### Tile lifecycle

Camera changes enter the tile pipeline through `setUpTileUpdateWhenMove.ts`.
The modules in `src/managers/tiles/` divide the work as follows:

* `tileRequestViewCalculator.ts` and `tileRequestMath.ts` convert the current
  view into requested tile coordinates.
* `tileRequestQueue.ts` deduplicates, schedules, and tracks network requests.
* `tileRequestEntityParser.ts` converts raw Ingress responses into typed portal,
  link, and field data.
* `tileRequestEntityHydrator.ts` collects placeholders and forwards parsed data
  to the domain render managers.
* `tileRequestManager.ts` is the facade used by Cesium setup and refresh code.

The tile manager owns fetching and hydration order. Portal, link, field, and
decoration managers own their records and Cesium representations.

### Domain render managers

`src/managers/entity/` is a historical directory name. Its managers now use a
mixture of the remaining Cesium entities and direct primitives:

* `portalEntityManager.ts` owns portal records, selectable entities, point
  primitives, portal positions, and portal detail refreshes.
* The portal label, ornament, history, and scout-control managers own the
  corresponding label, billboard, and point primitives.
* Link and field managers build primitive geometry by layer and replace it when
  refreshed data is ready.
* `debugTileEntityManager.ts` renders tile diagnostics in overlay layers.
* `entityPositionManager.ts` centralizes terrain-backed positions and notifies
  consumers through callbacks.
* `entityTranslucencyManager.ts` computes camera-dependent translucency once and
  publishes the current `NearFarScalar` to registered consumers.

Managers should expose domain data or focused read APIs to plugins. Consumers
should not depend on a manager's internal Cesium primitive records.

### Layer model

`LayerManager` owns visibility filters, persisted filter state, plugin layer
registration, and render ordering across four layer backends:

* **Data sources** hold compatibility or plugin features that still use Cesium
  entities.
* **Primitive layers** (`LayerPrimitives`) hold normally rendered billboard and
  point collections, plus other direct primitives.
* **Overlay layers** (`LayerOverlay`) hold labels, billboards, points, and
  primitives that must render above normal scene content. Their collection
  update hook rewrites only color-render commands into Cesium's overlay pass and
  disables depth testing; pick passes retain Cesium's normal commands.
* **Ground primitive layers** (`LayerGroundPrimitives`) hold terrain-clamped
  geometry. `AsyncPrimitiveReplacer` keeps the active geometry visible until a
  replacement primitive is ready, avoiding blank refresh frames.

Layer wrappers own collection lifetime and call `requestRender` after visible
state changes. `LayerManager` owns relative ordering between wrappers.

## Cesium interaction and picking

### Gesture pipeline

`src/cesium/interaction/` contains the custom camera and selection behavior:

* `gesture/` coordinates touch zoom and pinch lifecycle.
* `camera/` resolves terrain or ellipsoid gesture anchors and applies pan, zoom,
  and tilt camera changes.
* `state/interactionGestureState.ts` shares cancellation state between gesture
  and selection handlers.
* `selection/portalSelection.ts` performs portal prefetch and detail selection.

The core interaction handlers are installed by
`src/cesium/setup/setUpInteractionHandlers.ts` after the viewer and managers
exist.

### Portal primitive picking

Portal points and their visual decorations use the same pick-ID contract,
exported by `portalEntityManager.ts`:

```ts
interface PortalPrimitiveId {
  type: "portal";
  guid: string;
}
```

Point primitives, occlusion points, labels, ornaments, history halos, and
scout-control halos each keep a stable `PortalPrimitiveId` with their portal
record and reuse it when primitives are recreated or moved between layers. The
objects do not need to share identity; consumers recognize the `type` and
`guid` fields with `isPortalPrimitiveId`.

This makes every pickable portal representation resolve to the same domain
object. Portal selection can inspect the top result from one `Scene.pick`
instead of using `Scene.drillPick`, which repeatedly performs pick passes while
hiding previous results. Draw Lines uses the same ID to resolve the portal's
current primitive position for snapping.

New pickable portal decorations should use this ID instead of a manager-local
string or `Cesium.Entity`. Consumers must narrow unknown pick IDs with
`isPortalPrimitiveId` before reading the GUID. Purely decorative primitive
batches that must not participate in portal selection should use
`allowPicking: false` where Cesium supports it.

### Restoring color after picking

The viewer uses `requestRenderMode`, and Cesium does not draw a normal color
frame as part of synchronous `Scene.pick`. Every synchronous pick caller must
therefore call `restoreSceneAfterPick` immediately after picking:

```ts
const pickedObject = viewer.scene.pick(windowPosition);
restoreSceneAfterPick(viewer.scene);
```

The helper coalesces picks made in one JavaScript task and renders one normal
color frame in a microtask. This prevents invalidated WebGL drawing-buffer
regions from remaining visible while the scene is otherwise idle.

Current interactions intentionally use synchronous, throttled picks. Do not
replace them with `Scene.pickAsync` without retesting request-render behavior,
GPU-fence progress, and coordination between consumers of Cesium's scene pick
framebuffer.

## UI and plugins

### DOM UI

`src/components/` and `src/controllers/` implement the UI without React at
runtime. TSX is compiled through the custom JSX factory in `src/utils/dom.ts`,
which returns real DOM nodes.

Components are primarily DOM factories. Controllers retain pane state and DOM
references, coordinate callbacks, and re-render by replacing nodes. Core UI is
mounted from `mountCoreControllersAndUI.ts` after manager construction.

### Plugin lifecycle

Built-in plugins live in `src/plugins/` and are registered by
`registerPlugins.ts`. Separately built plugin userscripts wait for
`window.iitc.pluginManager` and register through the same interface.

Plugins consume the manager APIs exposed on `window.iitc`, including `viewer`,
`layerManager`, `interfaceManager`, `commManager`, and the domain managers.
Cross-plugin contracts should live beside the owning plugin, such as
`src/plugins/drawLines/api.ts`, rather than in core IITC types.

Every plugin must release its layers, subscriptions, event handlers, timers,
and DOM nodes in `deinit`. `PluginManager` owns enablement and lifecycle, while
`LayerManager` owns plugin layer filters and persisted visibility.

## Supporting services

Other manager groups provide application services without owning the Cesium
render graph:

* `src/managers/comm/` wraps Ingress communication state and requests.
* `src/managers/game/` owns player information, scores, and passcode redemption.
* `src/managers/system/` owns API requests, logging, settings, plugin lifecycle,
  loading progress, and plugin-facing UI mounting.
* `src/utils/` contains browser, DOM, storage, coordinate, text, window, and
  color helpers.

`safeLocalStorage` bridges browser `localStorage`, an in-memory fallback, and
Capacitor Preferences on native platforms.

## Build and distribution

* `vite.config.ts` builds the main userscript with Cesium loaded from its CDN
  bundle.
* `vite.plugin.config.ts` and `scripts/build-plugins.ts` build plugins as
  separate userscripts.
* `scripts/sync-version.ts` keeps package metadata, native projects, the README,
  and native script-injector Cesium versions aligned.
* Capacitor configuration and the `android/` and `ios/` projects package the
  same userscript runtime for native distribution.
