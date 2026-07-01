/**
 * Viewport framing helpers shared between the viewport setup and the
 * "reset view" control, so a reset restores the exact framing the viewports
 * loaded with.
 */

import * as cornerstone from "@cornerstonejs/core";

// Slight zoom-out applied to the 2D / stack panes on load so the selection box
// and the data-boundary frame don't sit flush against the panel edge. The 3D
// pane doesn't use it.
export const MARGIN_ZOOM = 0.92;

// The 3D pane isn't margin-zoomed on load (see viewport ids).
const is3dViewport = (id) => id.startsWith("coronal3d");

/**
 * Reset the camera on every viewport so the framing matches how the panes first
 * loaded, then reapply the 2D/stack margin zoom.
 *
 * 2D/stack panes: only zoom and in-plane pan are reset. resetToCenter is false
 * so the current slice is kept (a 2D pane doesn't jump to the middle) and the
 * orientation is left untouched.
 *
 * 3D pane: applyViewOrientation restores the orientation the pane loaded with
 * (undoing any trackball rotation of the object) and refits the camera, so both
 * the view and the object orientation return to their initial state.
 *
 * The DOM box overlays reposition off the following render (they track
 * IMAGE_RENDERED).
 */
export function resetViewportsView() {
  const renderingEngine = cornerstone.getRenderingEngines()[0];
  if (!renderingEngine) {
    return;
  }
  renderingEngine.getViewports().forEach((viewport) => {
    if (is3dViewport(viewport.id)) {
      // applyViewOrientation resets pan/zoom/center itself, so no resetCamera
      // or margin zoom is needed for the 3D pane.
      viewport.applyViewOrientation(viewport.options.orientation);
      viewport.render();
      return;
    }
    viewport.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: false,
      storeAsInitialCamera: false,
    });
    viewport.setZoom(MARGIN_ZOOM, false);
    viewport.render();
  });
}
