/**
 * Viewport camera helpers: align each 2D pane's camera to the loaded
 * volume's own voxel grid, so tilted / oblique acquisitions render square-on.
 */

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

/**
 * Expand `wrapper` to fill the viewport grid (or restore it if already
 * expanded), minimizing its sibling panes to ~1px. Shared by the double-click
 * handler and the on-pane expand button so both take exactly the same path.
 *
 * Returns the wrapper's expanded state after the toggle, so a caller tracking
 * button state stays in sync with the DOM it just mutated.
 */
export function toggleViewportExpanded(wrapper, renderingEngine) {
  if (!wrapper || !renderingEngine) {
    return false;
  }
  Array.from(wrapper.parentNode.children)
    .filter((child) => child !== wrapper)
    .forEach((child) => child.classList.toggle("minimized"));
  const expanded = wrapper.classList.toggle("expanded");
  wrapper.parentElement.classList.toggle("expanded");

  /* A hack to force-render the resized viewports */
  renderingEngine.resize(true, true);
  renderingEngine.render();

  return expanded;
}
