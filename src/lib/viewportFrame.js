/**
 * DOM overlays for the 2D viewports:
 *   - the data-boundary frame (the drawing limits), and
 *   - the mask-selection box (the expanded region) in the slice plane.
 *
 * Both are drawn as plain DOM borders rather than vtk actors so they can't be
 * clipped by the viewport's slab and are trivial to style. Cornerstone won't
 * draw the labelmap outline where the mask meets the image edge (there's no
 * "outside" voxel there), so for a full expand the mask has no visible outline
 * at all — these overlays make the box edges visible regardless.
 *
 * Positions are recomputed on every IMAGE_RENDERED via worldToCanvas, so the
 * overlays track zoom, pan, and slice scrolling. The mask box is also gated to
 * the slices the box actually covers, so it only appears where it applies.
 */

import { Enums } from "@cornerstonejs/core";

const DATA_FRAME_CLASS = "viewport-data-frame";
const MASK_BOX_CLASS = "viewport-mask-box";

// The 8 corners of a box as (i, j, k) ∈ {0, 1}: 0 picks the low bound, 1 the
// high bound along that axis.
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

// World positions of a box's 8 corners, given low/high index-space bounds.
// Returns null if the image data can't map indices to world (e.g. the CPU
// rendering fallback exposes no indexToWorld), so callers can skip gracefully.
function boxWorldCorners(imageData, lo, hi) {
  if (typeof imageData.indexToWorld !== "function") {
    return null;
  }
  return CORNERS.map(([ci, cj, ck]) =>
    imageData.indexToWorld(
      [ci ? hi[0] : lo[0], cj ? hi[1] : lo[1], ck ? hi[2] : lo[2]],
      [0, 0, 0],
    ),
  );
}

// Canvas-space bounding rect (CSS px, element-relative) of world corners.
function canvasRect(viewport, corners) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  corners.forEach((world) => {
    const [x, y] = viewport.worldToCanvas(world);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

// True if the current slice passes through the box. We compare the box's depth
// range along the view normal with the slice's depth (the focal point).
function sliceIntersectsCorners(viewport, corners, imageData) {
  const { viewPlaneNormal, focalPoint } = viewport.getCamera();
  const depth = (p) =>
    p[0] * viewPlaneNormal[0] +
    p[1] * viewPlaneNormal[1] +
    p[2] * viewPlaneNormal[2];

  let dMin = Infinity;
  let dMax = -Infinity;
  corners.forEach((c) => {
    const d = depth(c);
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  });

  const sliceDepth = depth(focalPoint);
  const eps = 0.5 * Math.min(...imageData.getSpacing());
  return sliceDepth >= dMin - eps && sliceDepth <= dMax + eps;
}

function positionFrame(frame, rect) {
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

/**
 * Attach the data-boundary frame to a viewport's element. Spans the whole
 * volume, so it's shown on every slice. Returns a detach function.
 */
export function attachDataFrame(viewport, element) {
  const frame = document.createElement("div");
  frame.className = DATA_FRAME_CLASS;
  element.appendChild(frame);

  const update = () => {
    const imageData = viewport.getImageData()?.imageData;
    if (!imageData) {
      return;
    }
    const [iSize, jSize, kSize] = imageData.getDimensions();
    const corners = boxWorldCorners(
      imageData,
      [-0.5, -0.5, -0.5],
      [iSize - 0.5, jSize - 0.5, kSize - 0.5],
    );
    if (corners) {
      positionFrame(frame, canvasRect(viewport, corners));
    }
  };

  element.addEventListener(Enums.Events.IMAGE_RENDERED, update);
  update();

  return () => {
    element.removeEventListener(Enums.Events.IMAGE_RENDERED, update);
    frame.remove();
  };
}

/**
 * Draw (or replace) the mask-selection box on a 2D viewport. `coords` are the
 * IJK min/max bounds (from getLabelmapBounds). The overlay is hidden on slices the
 * box doesn't cover. Cleanup is stored on the element; removeMaskBox2D clears
 * it.
 */
export function addMaskBox2D(viewport, coords, options = {}) {
  removeMaskBox2D(viewport);

  const element = viewport.element;
  const frame = document.createElement("div");
  frame.className = MASK_BOX_CLASS;
  if (options.borderColor) {
    frame.style.borderColor = options.borderColor;
  }
  element.appendChild(frame);

  const update = () => {
    const imageData = viewport.getImageData()?.imageData;
    if (!imageData) {
      frame.style.display = "none";
      return;
    }
    const lo = [coords.i.min - 0.5, coords.j.min - 0.5, coords.k.min - 0.5];
    const hi = [coords.i.max + 0.5, coords.j.max + 0.5, coords.k.max + 0.5];
    const corners = boxWorldCorners(imageData, lo, hi);
    // Hide the box on slices it doesn't cover (volume). For a single-image
    // stack the box always applies, so callers pass gateBySlice: false.
    const hidden =
      !corners ||
      (options.gateBySlice !== false &&
        !sliceIntersectsCorners(viewport, corners, imageData));
    if (hidden) {
      frame.style.display = "none";
      return;
    }
    frame.style.display = "block";
    positionFrame(frame, canvasRect(viewport, corners));
  };

  element.addEventListener(Enums.Events.IMAGE_RENDERED, update);
  update();

  element.__maskBox2dCleanup = () => {
    element.removeEventListener(Enums.Events.IMAGE_RENDERED, update);
    frame.remove();
    delete element.__maskBox2dCleanup;
  };
}

/** Remove the mask-selection box overlay from a 2D viewport, if present. */
export function removeMaskBox2D(viewport) {
  viewport?.element?.__maskBox2dCleanup?.();
}
