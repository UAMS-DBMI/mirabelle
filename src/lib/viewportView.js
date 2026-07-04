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

// MPR camera vectors per 2D pane, expressed in the volume's own axis basis
// (î/ĵ/k̂ = the rows of volume.direction — the world directions of the voxel
// grid's i/j/k axes). Values mirror Cornerstone's MPR_CAMERA_VALUES; its own
// ACQUISITION orientation is exactly the AXIAL row of this table.
const PANE_CAMERA_BASIS = {
  AXIAL: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
  SAGITTAL: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
  CORONAL: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
};

// Combine per-axis weights with the volume's axis directions into one world
// vector: world = w0·î + w1·ĵ + w2·k̂.
function combineVolumeAxes(direction, weights) {
  const world = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    for (let component = 0; component < 3; component += 1) {
      world[component] += weights[axis] * direction[axis * 3 + component];
    }
  }
  return world;
}

/**
 * Camera orientation that views the volume along its own (acquisition) axes
 * for the given pane. For an axis-aligned volume this equals Cornerstone's
 * world-space AXIAL/SAGITTAL/CORONAL cameras — no visible change. For an
 * oblique acquisition (gantry tilt, rotated orientation) it faces the voxel
 * grid square-on, so slices render untilted and the IJK selection box maps
 * 1:1 to screen rectangles — which the 2D box overlays and their resize
 * handles assume.
 */
export function acquisitionPaneOrientation(volume, pane) {
  const basis = PANE_CAMERA_BASIS[pane];
  const direction = volume?.direction;
  if (!basis || !direction || direction.length !== 9) {
    return null;
  }
  return {
    viewPlaneNormal: combineVolumeAxes(direction, basis.viewPlaneNormal),
    viewUp: combineVolumeAxes(direction, basis.viewUp),
  };
}

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
