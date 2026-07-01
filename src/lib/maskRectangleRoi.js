/**
 * PROTOTYPE — stack-mode mask selection with a native RectangleROITool.
 *
 * Instead of the hand-rolled DOM selection box (see viewportFrame.js
 * addMaskBox2D — a <div> overlay with custom drag/resize handles that rewrites
 * labelmap pixels on release), stack masking here uses Cornerstone's own
 * RectangleROITool plus the "stackRange" frame-range feature:
 *
 *   - The rectangle's four world-space corners give the in-plane (i, j) bounds,
 *     with resize/move handles for free.
 *   - AnnotationMultiSlice stores a frame range on the annotation's metadata
 *     (metadata.sliceIndex = start, metadata.multiSliceReference.sliceIndex =
 *     end). StackViewport.isReferenceViewable honours that range, so the one
 *     rectangle renders on every frame from start→end — the (k) bounds.
 *
 * Together they define the same IJK cuboid the DOM box produced, but with none
 * of the custom hit-testing/geometry code. Volume mode is untouched: it keeps
 * the labelmap + 3D box actor.
 *
 * Flip USE_RECTANGLE_ROI_FOR_STACK to false to fall back to the DOM box and
 * compare the two side by side.
 */

import * as cornerstoneTools from "@cornerstonejs/tools";

const { RectangleROITool, annotation, utilities } = cornerstoneTools;
const { AnnotationMultiSlice } = utilities;

// Master switch for the prototype. Only affects stack mode.
export const USE_RECTANGLE_ROI_FOR_STACK = true;

export const STACK_ROI_TOOL_NAME = RectangleROITool.toolName;

// Drop the ROI's area/stats text box — we only want the resizable rectangle.
export const STACK_ROI_TOOL_CONFIG = { calculateStats: false };

// Match the app's green selection theme (rgba(74, 222, 128) elsewhere) across
// the ROI's normal / hover / selected states.
const ROI_GREEN = "rgb(74, 222, 128)";
const ROI_STYLE = {
  color: ROI_GREEN,
  colorHighlighted: ROI_GREEN,
  colorSelected: ROI_GREEN,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** The current RectangleROI annotation on the stack viewport, or null. */
export function getStackRoiAnnotation(viewport) {
  if (!viewport) return null;
  const annotations = annotation.state.getAnnotations(
    STACK_ROI_TOOL_NAME,
    viewport.element,
  );
  // We keep a single selection box; if several exist, use the newest.
  return annotations?.length ? annotations[annotations.length - 1] : null;
}

/** Remove every stack ROI except keepUID, so only one selection box remains. */
export function keepSingleStackRoi(viewport, keepUID) {
  if (!viewport) return;
  const annotations =
    annotation.state.getAnnotations(STACK_ROI_TOOL_NAME, viewport.element) ??
    [];
  annotations
    .filter((a) => a.annotationUID !== keepUID)
    .forEach((a) => annotation.state.removeAnnotation(a.annotationUID));
}

/** Remove all stack ROI annotations and re-render. */
export function clearStackRoi(viewport) {
  if (!viewport) return;
  const annotations =
    annotation.state.getAnnotations(STACK_ROI_TOOL_NAME, viewport.element) ??
    [];
  annotations.forEach((a) =>
    annotation.state.removeAnnotation(a.annotationUID),
  );
  viewport.render();
}

/**
 * Prepare a stack ROI: keep it as the only box and paint it green (both
 * idempotent). When `applyDefaultRange` is set — only on the first draw, not on
 * later resizes — default its frame range to the whole stack (a through-stack
 * blackout cuboid) until the user narrows it with the range controls.
 *
 * RectangleROITool fires ANNOTATION_COMPLETED on every resize/move, so the
 * caller must gate `applyDefaultRange` to the initial draw; otherwise a resize
 * would clobber a range the user had narrowed.
 */
export function initStackRoiAnnotation(
  viewport,
  ann,
  { applyDefaultRange } = {},
) {
  if (!viewport || !ann) return;
  keepSingleStackRoi(viewport, ann.annotationUID);
  annotation.config.style.setAnnotationStyles(ann.annotationUID, ROI_STYLE);
  if (applyDefaultRange) {
    AnnotationMultiSlice.setRange(
      viewport,
      ann,
      0,
      viewport.getNumberOfSlices() - 1,
    );
  }
  viewport.render();
}

/** Set the ROI's range start (or end) to the current frame. */
export function setStackRoiRangeStart(viewport) {
  const ann = getStackRoiAnnotation(viewport);
  if (!viewport || !ann) return null;
  AnnotationMultiSlice.setStartRange(viewport, ann);
  viewport.render();
  return AnnotationMultiSlice.getFrameRangeStr(ann);
}
export function setStackRoiRangeEnd(viewport) {
  const ann = getStackRoiAnnotation(viewport);
  if (!viewport || !ann) return null;
  AnnotationMultiSlice.setEndRange(viewport, ann);
  viewport.render();
  return AnnotationMultiSlice.getFrameRangeStr(ann);
}

/**
 * IJK cuboid bounds of the stack ROI, or null if there's no annotation / the
 * image geometry isn't ready. (i, j) come from the rectangle's world corners;
 * (k) from the annotation's frame range.
 */
export function getStackRoiCoords(viewport) {
  const ann = getStackRoiAnnotation(viewport);
  if (!ann) return null;

  const imageData = viewport.getImageData()?.imageData;
  const points = ann.data?.handles?.points;
  if (!imageData || !points?.length) return null;

  let imin = Infinity;
  let imax = -Infinity;
  let jmin = Infinity;
  let jmax = -Infinity;
  points.forEach((world) => {
    const [i, j] = imageData.worldToIndex(world, [0, 0, 0]);
    imin = Math.min(imin, i);
    imax = Math.max(imax, i);
    jmin = Math.min(jmin, j);
    jmax = Math.max(jmax, j);
  });

  const [cols, rows] = imageData.getDimensions();
  const iBounds = {
    min: clamp(Math.round(imin), 0, cols - 1),
    max: clamp(Math.round(imax), 0, cols - 1),
  };
  const jBounds = {
    min: clamp(Math.round(jmin), 0, rows - 1),
    max: clamp(Math.round(jmax), 0, rows - 1),
  };

  // Frame range (k): sliceIndex is the start; multiSliceReference.sliceIndex the
  // end. A single-frame annotation has no multiSliceReference.
  const start = ann.metadata?.sliceIndex ?? viewport.getCurrentImageIdIndex();
  const end = ann.metadata?.multiSliceReference?.sliceIndex ?? start;
  const kBounds = { min: Math.min(start, end), max: Math.max(start, end) };

  return { i: iBounds, j: jBounds, k: kBounds };
}
