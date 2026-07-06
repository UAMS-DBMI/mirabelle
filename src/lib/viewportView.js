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

// The anatomical (world-space) camera for each 2D pane — Cornerstone's
// MPR_CAMERA_VALUES in patient LPS coordinates: e.g. the AXIAL camera looks
// up from the feet with the patient's anterior at the top of the screen.
const PANE_CAMERA_WORLD = {
  AXIAL: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
  SAGITTAL: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
  CORONAL: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
};

const PANE_ORDER = ["AXIAL", "SAGITTAL", "CORONAL"];

// All bijections pane-order position → voxel-axis index.
const AXIS_PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Unit-length world directions of the volume's voxel (i/j/k) axes — the rows
// of volume.direction. Null if any row is degenerate.
function volumeAxes(direction) {
  const axes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const row = [
      direction[axis * 3],
      direction[axis * 3 + 1],
      direction[axis * 3 + 2],
    ];
    const length = Math.hypot(row[0], row[1], row[2]);
    if (!(length > 1e-6)) {
      return null;
    }
    axes.push(row.map((component) => component / length));
  }
  return axes;
}

// Voxel-axis index per pane, chosen jointly: the bijection whose axes lie
// closest to the panes' anatomical normals overall (largest summed |dot|).
// A bijection — rather than each pane independently taking its closest axis —
// guarantees the three panes slice along three distinct voxel axes even for
// compound-oblique volumes (e.g. double-oblique cardiac MR) where one voxel
// axis is the single closest to two patient axes; independent picks there
// would render the same plane in two panes and leave one axis unviewable.
function paneAxisAssignment(axes) {
  let best = null;
  for (const permutation of AXIS_PERMUTATIONS) {
    let score = 0;
    for (let position = 0; position < 3; position += 1) {
      const wanted = PANE_CAMERA_WORLD[PANE_ORDER[position]].viewPlaneNormal;
      score += Math.abs(dot(axes[permutation[position]], wanted));
    }
    if (!best || score > best.score) {
      best = { permutation, score };
    }
  }
  const assignment = {};
  PANE_ORDER.forEach((pane, position) => {
    assignment[pane] = best.permutation[position];
  });
  return assignment;
}

// The given voxel axis, sign-flipped to point the same way as wanted.
function signedAxis(axis, wanted) {
  const sign = dot(axis, wanted) < 0 ? -1 : 1;
  return axis.map((component) => component * sign);
}

// Of the volume axes at candidateIndexes, the one lying closest to the wanted
// world direction (largest |dot|), sign-flipped to point the same way.
function closestSignedAxis(axes, wanted, candidateIndexes) {
  let best = null;
  for (const index of candidateIndexes) {
    const product = dot(axes[index], wanted);
    if (!best || Math.abs(product) > Math.abs(best.product)) {
      best = { index, product };
    }
  }
  return signedAxis(axes[best.index], wanted);
}

/**
 * Camera orientation for a 2D pane, aligned to the volume's own voxel grid.
 *
 * Starts from the pane's anatomical world camera and snaps its normal and up
 * onto voxel axes (sign included). An axis-aligned volume gets exactly the
 * world AXIAL/SAGITTAL/CORONAL camera; a gantry-tilted axial acquisition gets
 * the slightly tilted voxel axes, so slices render square-on and the IJK
 * selection box maps 1:1 to screen rectangles — which the 2D box overlays and
 * their resize handles assume.
 *
 * Snapping — rather than reinterpreting the world camera in the voxel basis —
 * is what keeps every pane anatomically correct when the voxel axes are
 * permuted or flipped relative to the patient (sagittal/coronal acquisitions,
 * NIfTI affines with negated axes): each pane views along whichever voxel
 * axis its joint assignment matched to its anatomical viewing direction (see
 * paneAxisAssignment), instead of assuming voxel k is the patient's superior
 * axis. The assignment depends only on the volume, so the three panes agree
 * on it without sharing state.
 */
export function acquisitionPaneOrientation(volume, pane) {
  const wanted = PANE_CAMERA_WORLD[pane];
  const direction = volume?.direction;
  if (!wanted || !direction || direction.length !== 9) {
    return null;
  }
  const axes = volumeAxes(direction);
  if (!axes) {
    return null;
  }
  const normalIndex = paneAxisAssignment(axes)[pane];
  return {
    viewPlaneNormal: signedAxis(axes[normalIndex], wanted.viewPlaneNormal),
    viewUp: closestSignedAxis(
      axes,
      wanted.viewUp,
      [0, 1, 2].filter((index) => index !== normalIndex),
    ),
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
