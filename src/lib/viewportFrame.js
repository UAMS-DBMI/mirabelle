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
const MASK_BOX_HANDLE_CLASS = "viewport-mask-box-handle";

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// The eight resize handles, given by which canvas side each one drives:
//   cx/cy are "min" (left/top), "max" (right/bottom), or null (that axis is
//   not driven — an edge handle). Positions are CSS percentages within the box.
const HANDLE_SPECS = [
  { cx: "min", cy: "min", left: "0%", top: "0%", cursor: "nwse-resize" },
  { cx: "max", cy: "min", left: "100%", top: "0%", cursor: "nesw-resize" },
  { cx: "min", cy: "max", left: "0%", top: "100%", cursor: "nesw-resize" },
  { cx: "max", cy: "max", left: "100%", top: "100%", cursor: "nwse-resize" },
  { cx: null, cy: "min", left: "50%", top: "0%", cursor: "ns-resize" },
  { cx: null, cy: "max", left: "50%", top: "100%", cursor: "ns-resize" },
  { cx: "min", cy: null, left: "0%", top: "50%", cursor: "ew-resize" },
  { cx: "max", cy: null, left: "100%", top: "50%", cursor: "ew-resize" },
];

const AXIS_KEYS = ["i", "j", "k"];

// Work out how in-plane cursor movement maps to IJK for this viewport. The IJK
// axis whose one-voxel step barely moves on screen is the slice/depth axis and
// stays fixed; the other two are in-plane. We also record which canvas axis
// (x/y) each in-plane IJK axis follows and in which direction, so a handle drag
// can set the right bound. Returns null if the mapping can't be derived.
function inPlaneAxisMapping(viewport, imageData, coords) {
  const center = [
    (coords.i.min + coords.i.max) / 2,
    (coords.j.min + coords.j.max) / 2,
    (coords.k.min + coords.k.max) / 2,
  ];
  const c0 = viewport.worldToCanvas(imageData.indexToWorld(center, [0, 0, 0]));
  const deltas = [0, 1, 2].map((axis) => {
    const stepped = [...center];
    stepped[axis] += 1;
    const c1 = viewport.worldToCanvas(
      imageData.indexToWorld(stepped, [0, 0, 0]),
    );
    return [c1[0] - c0[0], c1[1] - c0[1]];
  });
  const mag = deltas.map(([dx, dy]) => Math.hypot(dx, dy));

  let depthAxis = 0;
  for (let a = 1; a < 3; a += 1) {
    if (mag[a] < mag[depthAxis]) depthAxis = a;
  }
  const [a, b] = [0, 1, 2].filter((axis) => axis !== depthAxis);
  const [axisX, axisY] =
    Math.abs(deltas[a][0]) >= Math.abs(deltas[b][0]) ? [a, b] : [b, a];

  return {
    axisX,
    axisY,
    signX: Math.sign(deltas[axisX][0]) || 1,
    signY: Math.sign(deltas[axisY][1]) || 1,
  };
}

// Translate a canvas side ("min"/"max") into the IJK bound it controls, given
// the orientation sign for that axis. A right-edge handle ("max" in canvas)
// drives the IJK max only when the axis increases rightward (sign > 0).
function canvasSideToIjkSide(canvasSide, sign) {
  const highSide = canvasSide === "max";
  return highSide === sign > 0 ? "max" : "min";
}

// Move one IJK bound to the dragged value, rounded, clamped to the volume, and
// kept from crossing the opposite bound (so the box never inverts).
function setBound(coords, axisKey, ijkSide, value, dimSize) {
  const rounded = Math.round(value);
  const bound = coords[axisKey];
  if (ijkSide === "max") {
    bound.max = clamp(rounded, bound.min, dimSize - 1);
  } else {
    bound.min = clamp(rounded, 0, bound.max);
  }
}

// Shift one axis of the box by delta voxels, keeping its size and clamping the
// shift so the box stays fully inside the volume.
function translateBound(coords, axisKey, delta, dimSize) {
  const bound = coords[axisKey];
  const shift = clamp(delta, -bound.min, dimSize - 1 - bound.max);
  bound.min += shift;
  bound.max += shift;
}

function cloneCoords(coords) {
  return {
    i: { ...coords.i },
    j: { ...coords.j },
    k: { ...coords.k },
  };
}

// Fractional IJK position of a mouse event in the given viewport. `rect` is
// the viewport element's bounding rect, captured once at drag start — reading
// it per mousemove forces a reflow after every frame-position style write.
function cursorIjk(viewport, imageData, event, rect) {
  const world = viewport.canvasToWorld([
    event.clientX - rect.left,
    event.clientY - rect.top,
  ]);
  return imageData.worldToIndex(world, [0, 0, 0]);
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
  const element = viewport.element;

  // Re-point the overlay that's already up rather than rebuilding it. A
  // rebuild drops the very div a drag may be holding — and because the drag's
  // mousemove/mouseup live on `window` (see beginDrag), it would keep running
  // against the detached node and commit bounds the on-screen box never
  // showed, while a freshly built box sat at the pre-drag position. It also
  // churned 9 divs and 10 listeners per pane on every refresh.
  if (element.__maskBox2dApply) {
    element.__maskBox2dApply(coords, options);
    return;
  }

  const frame = document.createElement("div");
  frame.className = MASK_BOX_CLASS;
  element.appendChild(frame);

  // Current draw options. Replaced wholesale by __maskBox2dApply, so the
  // handlers below must read through `settings` rather than capturing
  // `options` — otherwise a refresh would leave the box committing through
  // the callbacks of a previous render.
  let settings = options;

  // The box the handles are dragging. Starts at the committed bounds and is
  // mutated live during a drag; on release the final value is handed back to
  // the caller via onResize.
  let liveCoords = cloneCoords(coords);

  // True between mousedown and mouseup on this pane's box. While it's set, an
  // external refresh restyles the box but must not move it: the in-flight drag
  // owns the bounds until it commits.
  let dragging = false;

  const update = () => {
    const imageData = viewport.getImageData()?.imageData;
    if (!imageData) {
      frame.style.display = "none";
      return;
    }
    const lo = [
      liveCoords.i.min - 0.5,
      liveCoords.j.min - 0.5,
      liveCoords.k.min - 0.5,
    ];
    const hi = [
      liveCoords.i.max + 0.5,
      liveCoords.j.max + 0.5,
      liveCoords.k.max + 0.5,
    ];
    const corners = boxWorldCorners(imageData, lo, hi);
    // Hide the box on slices it doesn't cover (volume). For a single-image
    // stack the box always applies, so callers pass gateBySlice: false.
    const hidden =
      !corners ||
      (settings.gateBySlice !== false &&
        !sliceIntersectsCorners(viewport, corners, imageData));
    if (hidden) {
      frame.style.display = "none";
      return;
    }
    frame.style.display = "block";
    positionFrame(frame, canvasRect(viewport, corners));
  };

  const hooks = {
    getCoords: () => liveCoords,
    setCoords: (next) => {
      liveCoords = next;
      update();
      // Fires on every drag step (not just on release) so callers can mirror
      // the in-progress box elsewhere — e.g. the 3D pane. onResize still
      // commits the final bounds on mouse-up.
      settings.onLiveResize?.(liveCoords);
    },
    // Move/resize is live only while the caller supplies onResize — under
    // window level / crosshairs the box is frozen and click-through so those
    // tools get the clicks. Read per event, not captured, so a tool change
    // takes effect without rebuilding the overlay.
    isInteractive: () => Boolean(settings.onResize),
    begin: () => {
      dragging = true;
    },
    commit: () => {
      dragging = false;
      settings.onResize?.(liveCoords);
    },
  };

  const handles = attachBoxInteractions(viewport, frame, hooks);

  // The translucent middle at the current opacity, as a CSS colour — or null
  // to leave the stylesheet's default background alone (callers that don't
  // pass fill settings keep the old look).
  const fillBackground = () => {
    const { fillColor, fillAlpha, opacity } = settings;
    if (!fillColor || fillAlpha === undefined) return null;
    const alpha = fillAlpha * (opacity === undefined ? 1 : opacity);
    const rgb = fillColor.map((channel) => Math.round(channel * 255)).join(", ");
    return `rgba(${rgb}, ${alpha})`;
  };

  const applyStyle = () => {
    frame.style.borderColor = settings.borderColor || "";
    // The opacity slider drives the SURFACE only: the translucent middle
    // fades while the border and the resize handles keep full strength, so
    // turning the glass down never makes the selection outline harder to find
    // or grab. (Removing the box entirely is the eye toggle's job.) Element
    // opacity is deliberately not used — it scales border, fill and handles
    // as one, and an element at opacity 0 still takes pointer events, which
    // once left invisible-but-working drag handles on screen.
    const background = fillBackground();
    frame.style.background = background === null ? "" : background;
    const interactive = hooks.isInteractive();
    frame.style.pointerEvents = interactive ? "auto" : "none";
    frame.style.cursor = interactive ? "move" : "";
    handles.forEach((handle) => {
      handle.style.display = interactive ? "block" : "none";
    });
  };

  element.addEventListener(Enums.Events.IMAGE_RENDERED, update);

  // Re-point and restyle this overlay in place (the addMaskBox2D re-entry
  // above). Style always lands; the bounds are left alone mid-drag.
  element.__maskBox2dApply = (nextCoords, nextOptions) => {
    settings = nextOptions;
    applyStyle();
    if (!dragging) {
      liveCoords = cloneCoords(nextCoords);
    }
    update();
  };

  // Let external code drive this box's position — used to mirror a drag
  // happening in another pane onto this one. Reassigns the live bounds and
  // repositions immediately; update() still gates the box to the slices it
  // covers, so it shows only where it applies. Ignored on the pane that owns
  // the drag, which is already showing exactly these bounds.
  element.__maskBox2dSetLive = (next) => {
    if (dragging) return;
    liveCoords = cloneCoords(next);
    update();
  };

  // Let external code restyle this box's opacity in place (the mask opacity
  // slider) without rebuilding the overlay. Only the fill background moves —
  // applyStyle keeps border and handles at full strength.
  element.__maskBox2dSetOpacity = (next) => {
    settings = { ...settings, opacity: next };
    applyStyle();
  };

  element.__maskBox2dCleanup = () => {
    element.removeEventListener(Enums.Events.IMAGE_RENDERED, update);
    frame.remove();
    delete element.__maskBox2dCleanup;
    delete element.__maskBox2dApply;
    delete element.__maskBox2dSetLive;
    delete element.__maskBox2dSetOpacity;
  };

  applyStyle();
  update();
}

// Run a drag: forward each move to onMove, and on release commit the result.
// The box is dragged live via hooks.setCoords inside onMove.
function beginDrag(hooks, onMove) {
  hooks.begin();
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    hooks.commit();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

/**
 * Make a 2D mask box editable in the slice plane: drag the body to move it,
 * drag a handle to resize it. Each pane edits the two in-plane IJK axes; the
 * slice (depth) axis is left to the other panes. `hooks` reads/writes the live
 * box and commits the final bounds on mouse-up.
 *
 * Attached once, for the life of the overlay; `hooks.isInteractive()` decides
 * per event whether a drag may start, so switching left-click tools freezes
 * the box without tearing the overlay down. Returns the handle elements so
 * the caller can show/hide them with that same state.
 */
function attachBoxInteractions(viewport, frame, hooks) {
  // Move: drag the box body.
  frame.addEventListener("mousedown", (downEvent) => {
    // Left button only; let right/middle (pan/zoom) fall through to the tools.
    if (downEvent.button !== 0 || !hooks.isInteractive()) return;
    downEvent.preventDefault();
    downEvent.stopPropagation();

    const imageData = viewport.getImageData()?.imageData;
    if (!imageData) return;
    const mapping = inPlaneAxisMapping(viewport, imageData, hooks.getCoords());
    if (!mapping) return;
    const dims = imageData.getDimensions();
    const rect = viewport.element.getBoundingClientRect();
    const startCoords = cloneCoords(hooks.getCoords());
    const startIjk = cursorIjk(viewport, imageData, downEvent, rect);

    beginDrag(hooks, (moveEvent) => {
      const ijk = cursorIjk(viewport, imageData, moveEvent, rect);
      const next = cloneCoords(startCoords);
      [mapping.axisX, mapping.axisY].forEach((axis) => {
        const delta = Math.round(ijk[axis] - startIjk[axis]);
        translateBound(next, AXIS_KEYS[axis], delta, dims[axis]);
      });
      hooks.setCoords(next);
    });
  });

  // Resize: the eight handles. Each stops propagation so grabbing a handle
  // resizes rather than triggering the body's move.
  return HANDLE_SPECS.map((spec) => {
    const handle = document.createElement("div");
    handle.className = MASK_BOX_HANDLE_CLASS;
    handle.style.left = spec.left;
    handle.style.top = spec.top;
    handle.style.cursor = spec.cursor;

    handle.addEventListener("mousedown", (downEvent) => {
      if (downEvent.button !== 0 || !hooks.isInteractive()) return;
      // Keep the drag off the viewport's tools (scissors / pan) and the move.
      downEvent.preventDefault();
      downEvent.stopPropagation();

      const imageData = viewport.getImageData()?.imageData;
      if (!imageData) return;
      const mapping = inPlaneAxisMapping(viewport, imageData, hooks.getCoords());
      if (!mapping) return;
      const dims = imageData.getDimensions();
      const rect = viewport.element.getBoundingClientRect();

      beginDrag(hooks, (moveEvent) => {
        const ijk = cursorIjk(viewport, imageData, moveEvent, rect);
        const next = cloneCoords(hooks.getCoords());
        if (spec.cx) {
          setBound(
            next,
            AXIS_KEYS[mapping.axisX],
            canvasSideToIjkSide(spec.cx, mapping.signX),
            ijk[mapping.axisX],
            dims[mapping.axisX],
          );
        }
        if (spec.cy) {
          setBound(
            next,
            AXIS_KEYS[mapping.axisY],
            canvasSideToIjkSide(spec.cy, mapping.signY),
            ijk[mapping.axisY],
            dims[mapping.axisY],
          );
        }
        hooks.setCoords(next);
      });
    });

    frame.appendChild(handle);
    return handle;
  });
}

/** Remove the mask-selection box overlay from a 2D viewport, if present. */
export function removeMaskBox2D(viewport) {
  viewport?.element?.__maskBox2dCleanup?.();
}
