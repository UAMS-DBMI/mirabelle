import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import { getCoordsForStackSeg, getLabelmapBounds } from "@/utilities";

/*
 * Session-local drafts of the mask selection (its IJK bounding box) keyed by
 * IEC.
 *
 * The mask viewer tears down its segmentation on every navigation (next /
 * previous / queue click / leaving the route), which would throw away any
 * selection that hadn't been submitted yet. The viewer calls
 * rememberMaskSelection() from that teardown and restoreMaskSelection() once
 * the next visit's segmentation exists, so drawn work survives navigation for
 * the lifetime of the tab.
 */

const drafts = new Map();

// Observable snapshot of *which* IECs currently have a draft (not their
// bounds). The queue subscribes to this to mark rows and offer an
// "Active mask" filter. Kept as an immutable Set that's only replaced when
// membership changes, so useSyncExternalStore's getSnapshot stays stable
// between renders and re-renders fire only when a row gains or loses a draft.
let draftIdsSnapshot = new Set();
const listeners = new Set();

function publishMembership() {
  draftIdsSnapshot = new Set(drafts.keys());
  listeners.forEach((listener) => listener());
}

/** Subscribe to draft-membership changes; returns an unsubscribe function. */
export function subscribeMaskDrafts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable Set of the IEC ids (as strings) that currently have a draft. */
export function getMaskDraftIds() {
  return draftIdsSnapshot;
}

const { segmentation: csToolsSegmentation } = cornerstoneTools;

function segmentationExists(segmentationId) {
  return Boolean(csToolsSegmentation.state.getSegmentation(segmentationId));
}

// The selection is defined solely by its IJK bounding box (see MaskIEC):
// volumes track it on the labelmap's voxel manager, stacks derive it from the
// painted labelmap pixels.
function readSelectionBounds(segmentationId) {
  if (cornerstone.cache.getVolume(segmentationId)) {
    return getLabelmapBounds(segmentationId);
  }
  const imageIds = csToolsSegmentation.getLabelmapImageIds(segmentationId);
  return imageIds?.length ? getCoordsForStackSeg(imageIds) : null;
}

// Volume labelmaps never have their draft voxels painted — the box overlays
// and Accept both read only the voxel manager's tracked bounds, exactly like
// the drag-resize commit in MaskIEC. Clamped in case the draft was saved at a
// different decimation than the volume now loaded.
function applyBoundsToVolumeLabelmap(segmentationId, bounds) {
  const segVolume = cornerstone.cache.getVolume(segmentationId);
  if (!segVolume?.voxelManager) return false;
  const [ni, nj, nk] = segVolume.dimensions;
  const clampAxis = (axis, size) => [
    Math.max(0, Math.min(axis.min, size - 1)),
    Math.max(0, Math.min(axis.max, size - 1)),
  ];
  segVolume.voxelManager.setBounds([
    clampAxis(bounds.i, ni),
    clampAxis(bounds.j, nj),
    clampAxis(bounds.k, nk),
  ]);
  return true;
}

// Stacks have no tracked bounds, so materialise the box by painting the
// labelmap pixels it covers — the same mechanism as MaskIEC's stack resize
// commit (the raw labelmap is hidden; only the box overlay shows).
function applyBoundsToStackLabelmap(segmentationId, bounds) {
  const imageIds = csToolsSegmentation.getLabelmapImageIds(segmentationId);
  if (!imageIds?.length) return false;
  let applied = false;
  imageIds.forEach((imageId, k) => {
    const image = cornerstone.cache.getImage(imageId);
    const pixelData = image?.getPixelData();
    if (!pixelData) return;
    pixelData.fill(0);
    if (k < bounds.k.min || k > bounds.k.max) return;
    const { rows, columns } = image;
    const jMax = Math.min(bounds.j.max, rows - 1);
    const iMax = Math.min(bounds.i.max, columns - 1);
    for (let j = Math.max(bounds.j.min, 0); j <= jMax; j += 1) {
      const rowStart = j * columns;
      for (let i = Math.max(bounds.i.min, 0); i <= iMax; i += 1) {
        pixelData[rowStart + i] = 1;
        applied = true;
      }
    }
  });
  return applied;
}

/**
 * Save the exam's current selection as a draft — or drop the stored draft if
 * the selection is empty (cleared, or never drawn), so a stale draft can't
 * resurrect on the next visit. A no-op while the segmentation doesn't exist
 * yet (navigating away mid-load), so an unseen earlier draft isn't destroyed.
 */
export function rememberMaskSelection(iec, segmentationId) {
  if (!iec || !segmentationId || !segmentationExists(segmentationId)) return;
  let bounds;
  try {
    bounds = readSelectionBounds(segmentationId);
  } catch (error) {
    console.warn(
      "[maskDrafts] could not read the selection; keeping any existing draft",
      error,
    );
    return;
  }
  const key = String(iec);
  if (bounds) {
    const isNew = !drafts.has(key);
    drafts.set(key, bounds);
    // Only membership changes need to notify subscribers — editing the bounds
    // of an already-marked row doesn't change how it renders in the queue.
    if (isNew) publishMembership();
  } else if (drafts.delete(key)) {
    publishMembership();
  }
}

/**
 * Drop this IEC's draft outright. Used when the selection stops being a
 * pending one — the mask was submitted (Accept) or the exam was skipped /
 * marked non-maskable — so the cleanup save doesn't re-persist a box that no
 * longer represents unfinished work.
 */
export function forgetMaskDraft(iec) {
  if (iec == null) return;
  if (drafts.delete(String(iec))) publishMembership();
}

/** Whether the given IEC currently has a saved draft. */
export function hasMaskDraft(iec) {
  return iec != null && drafts.has(String(iec));
}

/**
 * Apply an arbitrary IJK bounding box as the exam's selection — the shared
 * write path for restoring a draft and for seeding the selection from the
 * exam's already-submitted mask. Fires the segmentation-data-modified event
 * on success so the selection box overlays redraw. Returns whether it was
 * applied.
 */
export function applyMaskSelection(segmentationId, bounds) {
  if (!bounds || !segmentationId || !segmentationExists(segmentationId)) {
    return false;
  }
  const applied = cornerstone.cache.getVolume(segmentationId)
    ? applyBoundsToVolumeLabelmap(segmentationId, bounds)
    : applyBoundsToStackLabelmap(segmentationId, bounds);
  if (!applied) return false;
  csToolsSegmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
    segmentationId,
  );
  return true;
}

/**
 * Re-apply the draft saved for this IEC to a freshly created segmentation.
 * Returns whether a draft was applied.
 */
export function restoreMaskSelection(iec, segmentationId) {
  const draft = iec != null ? drafts.get(String(iec)) : undefined;
  return draft ? applyMaskSelection(segmentationId, draft) : false;
}

/**
 * Whether the current selection is exactly the given bounds. This is how the
 * draft savers tell an untouched seed (the selection MaskIEC pre-fills from
 * the exam's submitted mask) from curator work: a selection still equal to
 * the seed is not unfinished work and must not flag the exam as drafted.
 */
export function selectionMatchesBounds(segmentationId, bounds) {
  if (!bounds || !segmentationId || !segmentationExists(segmentationId)) {
    return false;
  }
  let current;
  try {
    current = readSelectionBounds(segmentationId);
  } catch (error) {
    console.warn("[maskDrafts] could not read the selection to compare", error);
    return false;
  }
  if (!current) return false;
  return ["i", "j", "k"].every(
    (axis) =>
      current[axis].min === bounds[axis].min &&
      current[axis].max === bounds[axis].max,
  );
}
