/**
 * A slice-position scrollbar for a 2D (orthographic) viewport.
 *
 * Draws a thin vertical track down the right edge of the pane with a thumb that
 * shows how far through the stack the current slice is — the "where did we
 * scroll to" indicator. The thumb tracks every scroll (it repositions on each
 * IMAGE_RENDERED, the same signal the box overlays use, so wheel-scroll, MPR
 * crosshair jumps, and programmatic scrolls all move it), and it's draggable so
 * the user can scrub through slices directly.
 *
 * Top of the track is slice 0, bottom is the last slice — index order, matching
 * viewport.getSliceIndex().
 */

import { Enums } from "@cornerstonejs/core";

const SCROLLBAR_CLASS = "viewport-slice-scrollbar";
const THUMB_CLASS = "viewport-slice-scrollbar-thumb";
const LABEL_CLASS = "viewport-slice-scrollbar-label";

// Smallest the thumb is allowed to get on a deep stack, so it stays grabbable.
const MIN_THUMB_PX = 18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Current slice index and total, or null while the volume isn't ready (the
// helpers read the camera's slice range, which is undefined before load).
function readSlicePosition(viewport) {
  const total = viewport.getNumberOfSlices?.();
  const index = viewport.getSliceIndex?.();
  if (!Number.isFinite(total) || total < 2 || !Number.isFinite(index)) {
    return null;
  }
  return { index, total };
}

/**
 * Attach a slice scrollbar to a 2D viewport's element. Returns a detach
 * function; call it before re-attaching (volume change) and on unmount.
 */
export function attachSliceScrollbar(viewport, element) {
  const track = document.createElement("div");
  track.className = SCROLLBAR_CLASS;

  const thumb = document.createElement("div");
  thumb.className = THUMB_CLASS;
  track.appendChild(thumb);

  const label = document.createElement("div");
  label.className = LABEL_CLASS;
  thumb.appendChild(label);

  element.appendChild(track);

  const update = () => {
    const position = readSlicePosition(viewport);
    if (!position) {
      track.style.display = "none";
      return;
    }
    track.style.display = "block";

    const { index, total } = position;
    // Thumb height is one slice's share of the track, floored at MIN_THUMB_PX
    // so it stays grabbable; expressed as a % of the track's own height.
    const trackHeight = track.clientHeight || 1;
    const thumbPct = clamp(
      Math.max((100 / total), (MIN_THUMB_PX / trackHeight) * 100),
      0,
      100,
    );
    // index / (total - 1) maps the first slice to the top and the last to the
    // bottom; scaled by the leftover travel so the thumb never overflows.
    const fraction = index / (total - 1);
    const topPct = fraction * (100 - thumbPct);
    thumb.style.height = `${thumbPct}%`;
    thumb.style.top = `${topPct}%`;
    label.textContent = `${index + 1} / ${total}`;
  };

  // Scrub: map the pointer's Y within the track to a target slice, keeping the
  // grab offset so grabbing the thumb doesn't jump it. Scroll by the index
  // delta — getSliceIndex is the source of truth, so update() re-syncs after.
  let grabOffsetPx = 0;

  const scrubToPointer = (clientY) => {
    const position = readSlicePosition(viewport);
    if (!position) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const thumbHeightPx = thumb.getBoundingClientRect().height;
    const travel = Math.max(rect.height - thumbHeightPx, 1);
    // Convert the pointer (minus where it grabbed the thumb) to the thumb's top,
    // then to a 0..1 fraction of the available travel.
    const top = clientY - grabOffsetPx - rect.top;
    const fraction = clamp(top / travel, 0, 1);
    const target = Math.round(fraction * (position.total - 1));
    const delta = target - position.index;
    if (delta !== 0) {
      viewport.scroll(delta);
    }
  };

  const onPointerMove = (event) => {
    event.preventDefault();
    scrubToPointer(event.clientY);
  };

  const onPointerUp = () => {
    track.classList.remove("dragging");
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
  };

  const onPointerDown = (event) => {
    // Left button only; leave right/middle for the viewport's pan/zoom tools.
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // If the grab landed on the thumb, keep the offset so it doesn't jump;
    // clicking the bare track jumps the thumb centre to the pointer.
    const thumbRect = thumb.getBoundingClientRect();
    const onThumb =
      event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    grabOffsetPx = onThumb
      ? event.clientY - thumbRect.top
      : thumbRect.height / 2;
    track.classList.add("dragging");
    scrubToPointer(event.clientY);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  };

  track.addEventListener("mousedown", onPointerDown);
  element.addEventListener(Enums.Events.IMAGE_RENDERED, update);
  update();

  return () => {
    element.removeEventListener(Enums.Events.IMAGE_RENDERED, update);
    track.removeEventListener("mousedown", onPointerDown);
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    track.remove();
  };
}
