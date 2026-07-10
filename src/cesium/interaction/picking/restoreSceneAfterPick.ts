/**
 * Fixed black canvas patches after synchronous Scene.pick calls by rendering
 * one normal color pass after all picks in the current JavaScript task.
 *
 * Scene.pick replaces the shared frame state with a small pick culling volume and
 * renders object IDs into an offscreen framebuffer. Cesium then ends that frame
 * with the default framebuffer rebound, but it does not draw the normal map into
 * that framebuffer as part of picking.
 *
 * Cesium's WebGL context defaults preserveDrawingBuffer to false, so the previous
 * color frame is not guaranteed to remain available after the pick. In continuous
 * render mode the next frame replaces it immediately. In request-render mode,
 * however, the browser can present or capture the canvas before that color frame
 * runs. In this app the invalidated regions appear as large black patches around
 * ground primitives.
 */

import type * as Cesium from "cesium";

const pendingSceneRestores = new WeakSet<Cesium.Scene>();

/**
 * Schedules one normal color render after all synchronous picks in the current
 * JavaScript task have finished.
 *
 * Call this immediately after Scene.pick, including when the pick returns undefined.
 *
 * @example
 * const pickedObject = viewer.scene.pick(windowPosition);
 * restoreSceneAfterPick(viewer.scene);
 *
 * if (pickedObject && "id" in pickedObject) {
 *   handlePickedId(pickedObject.id);
 * }
 */
export function restoreSceneAfterPick(scene: Cesium.Scene): void {
  // Keep Cesium's regular render loop aware that the scene needs another frame.
  scene.requestRender();

  // Multiple plugins may pick in response to one pointer event. One color pass
  // after the last synchronous pick is enough to restore the shared scene state.
  if (pendingSceneRestores.has(scene)) return;

  pendingSceneRestores.add(scene);
  window.queueMicrotask(() => {
    pendingSceneRestores.delete(scene);
    if (scene.isDestroyed()) return;

    // Render explicitly because requestRenderMode may otherwise defer this pass,
    // leaving the canvas without a fresh color frame until another scene change.
    scene.requestRender();
    scene.render();
  });
}
