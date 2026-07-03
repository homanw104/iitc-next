# AGENT.md

## Project Purpose

IITC Next is a TypeScript rewrite of IITC that uses
Cesium instead of Leaflet.

## Architecture

See `docs/architecture.md` for the detailed architecture.

Key findings for agents:

* This is a Vite userscript injected into Ingress Intel, with Capacitor Android
  and iOS shells that inject the built userscript into native WebViews.
* `src/bootstrap.ts` installs the vanilla Intel blocker first, then dynamically
  imports `src/app.ts`.
* `src/app.ts` is a procedural boot sequence. `src/procedures/` owns one-time
  startup wiring; avoid hiding startup side effects in constructors.
* `src/cesium/setup/` owns Cesium-specific runtime construction: viewer
  creation, base-layer view models, core manager construction, manager exposure,
  built-in UI mounting, camera/interaction hooks, and tile refresh wiring.
* `src/cesium/setup/createCoreManagers.ts` constructs the runtime manager graph,
  and `src/cesium/setup/exposeCoreManagers.ts` publishes it through
  `window.iitc`, which is the plugin integration surface. Some app-wide
  singletons, such as `logManager` and `apiRequestManager`, are exposed directly
  in their setup procedures.
* TSX is not React here. `src/utils/dom.ts` is a custom JSX factory that returns
  real DOM nodes.
* `src/managers/` is the domain/runtime layer, grouped into `tiles/`,
  `entity/`, `layer/`, `comm/`, `game/`, and `system/`.
* `LayerManager` and some Cesium interaction code use Cesium private/internal
  structures. Changes there need real rendering verification.
* Plugins must clean up data sources, overlays, event handlers, timers, and DOM
  nodes in `deinit`.

## Coding Style

* Make sure to blend in the coding style of the existing code.
* Don't introduce helper functions that are too small and only used twice or so.
* Every source file should begin with a JSDoc-style block comment describing the
  file, without tags like `@param` or `@returns`. Files under `src/components/`
  are exempt.
* Any file that calls `logManager.debug/info/warn/error` should define a
  `const LOG_TAG = "PascalCaseName"` near the top of the file and pass
  `LOG_TAG` to `logManager`. The name should match the file, manager, or plugin
  identity in PascalCase, such as `TileRequestQueue` or `DrawLinesPlugin`.
