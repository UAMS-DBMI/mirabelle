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
 * Reset zoom and pan on every viewport, then reapply the 2D/stack margin zoom so
 * the framing matches how the panes first loaded. Only zoom and in-plane pan are
 * reset: resetToCenter is false so the current slice is kept (a 2D pane doesn't
 * jump to the middle), and orientation/rotation are left untouched. The DOM box
 * overlays reposition off the following render (they track IMAGE_RENDERED).
 */
export function resetViewportsView() {
  const renderingEngine = cornerstone.getRenderingEngines()[0];
  if (!renderingEngine) {
    return;
  }
  renderingEngine.getViewports().forEach((viewport) => {
    viewport.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: false,
      storeAsInitialCamera: false,
    });
    if (!is3dViewport(viewport.id)) {
      viewport.setZoom(MARGIN_ZOOM, false);
    }
    viewport.render();
  });
}
