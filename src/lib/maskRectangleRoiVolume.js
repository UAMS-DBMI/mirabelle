/**
 * Volume-mode mask selection: native RectangleROI boxes on the orthographic
 * panes, kept in sync as one 3D IJK cuboid.
 *
 * Each ortho pane shows two of the three IJK axes — its "depth" axis runs into
 * the screen — so no single rectangle can define the whole box; you build it up
 * across panes:
 *
 *     - Axial   sets i, j     (depth k)
 *     - Coronal sets i, k     (depth j)
 *     - Sagittal sets j, k    (depth i)
 *
 * Each axis is in-plane on exactly two panes, so any two orthogonal rectangles
 * pin down all three axes. There's a single shared box; editing any pane folds
 * its two in-plane axes into it, and every other pane (plus the 3D actor) re-syncs
 * live to match — so drawing/resizing in one viewport updates the others as you
 * go. Until the box's two in-plane axes for a pane are both known, that pane shows
 * nothing (so a one-pane draw never balloons into a full-height box elsewhere).
 *
 * At most three rectangles exist, one per pane, each editable and drawn once (a
 * second draw in the same pane is blocked — see MaskRectangleRoiTool); each is
 * re-anchored to the current slice as you scroll so it overlays every slice. The
 * shared box is written to the segmentation volume's voxel-manager bounds — what
 * handleAccept and the 3D actor read — only once all three axes are pinned down.
 *
 * Flip USE_RECTANGLE_ROI_FOR_VOLUME to false to restore the old DOM box.
 */

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import { addMaskBox, removeMaskBox } from "@/lib/maskBox";
import {
  MaskRectangleRoiTool,
  MASK_ROI_STYLE,
  MASK_ROI_TOOL_NAME,
} from "@/lib/maskRectangleRoiTool";

const { annotation, Enums: csToolsEnums } = cornerstoneTools;
const { Events: csToolsEvents } = csToolsEnums;
const { Events: csEvents } = cornerstone.Enums;

// Master switch for the volume prototype. Only affects volume mode.
export const USE_RECTANGLE_ROI_FOR_VOLUME = true;

const ROI_TOOL_NAME = MASK_ROI_TOOL_NAME;
const ORTHO_VIEWPORT_IDS = ["axial2d", "coronal2d", "sagittal2d"];
const BOX_3D_VIEWPORT_ID = "coronal3d";
const AXIS_KEYS = ["i", "j", "k"];

const BOX_3D_STYLE = {
  color: [0.3, 0.85, 0.3],
  edgeColor: [0.6, 1, 0.6],
  opacity: 0.8,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// The two in-plane IJK axes (0/1/2) of a pane, given its depth axis.
function inPlaneAxes(depthAxis) {
  return [0, 1, 2].filter((axis) => axis !== depthAxis);
}

// A box is complete once every axis has been pinned down by a rectangle.
function isBoxComplete(box) {
  return Boolean(box.i && box.j && box.k);
}

// The IJK axis (0/1/2) that runs "into the screen" for this viewport: a one-voxel
// step along it barely moves on canvas. The other two axes are in-plane.
function depthAxisFor(viewport, imageData) {
  const dims = imageData.getDimensions();
  const center = dims.map((d) => (d - 1) / 2);
  const c0 = viewport.worldToCanvas(imageData.indexToWorld(center, [0, 0, 0]));
  let depthAxis = 0;
  let smallest = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const stepped = [...center];
    stepped[axis] += 1;
    const c1 = viewport.worldToCanvas(
      imageData.indexToWorld(stepped, [0, 0, 0]),
    );
    const magnitude = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    if (magnitude < smallest) {
      smallest = magnitude;
      depthAxis = axis;
    }
  }
  return depthAxis;
}

// Current in-view slice index along `axis` (rounded, clamped to the volume).
function currentSlice(viewport, imageData, axis, dims) {
  const idx = imageData.worldToIndex(
    viewport.getCamera().focalPoint,
    [0, 0, 0],
  );
  return clamp(Math.round(idx[axis]), 0, dims[axis] - 1);
}

// This pane's two in-plane IJK bounds (from a rectangle's four world corners),
// keyed by axis letter. The depth axis is left out — it's owned by other panes.
function readInPlaneBounds(points, imageData, depthAxis, dims) {
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  points.forEach((world) => {
    const idx = imageData.worldToIndex(world, [0, 0, 0]);
    for (let axis = 0; axis < 3; axis += 1) {
      mins[axis] = Math.min(mins[axis], idx[axis]);
      maxs[axis] = Math.max(maxs[axis], idx[axis]);
    }
  });

  const update = {};
  inPlaneAxes(depthAxis).forEach((axis) => {
    update[AXIS_KEYS[axis]] = {
      min: clamp(Math.round(mins[axis]), 0, dims[axis] - 1),
      max: clamp(Math.round(maxs[axis]), 0, dims[axis] - 1),
    };
  });
  return update;
}

// The four world corners of the box's cross-section on a plane: the two in-plane
// axes span the box, the depth axis sits at `slice`.
function boxToPlanePoints(box, depthAxis, slice, imageData) {
  const bounds = [box.i, box.j, box.k];
  const [a, b] = inPlaneAxes(depthAxis);
  const corners = [
    [bounds[a].min, bounds[b].min],
    [bounds[a].max, bounds[b].min],
    [bounds[a].max, bounds[b].max],
    [bounds[a].min, bounds[b].max],
  ];
  return corners.map(([va, vb]) => {
    const ijk = [0, 0, 0];
    ijk[a] = va;
    ijk[b] = vb;
    ijk[depthAxis] = slice;
    return Array.from(imageData.indexToWorld(ijk, [0, 0, 0]));
  });
}

/**
 * Wire up the volume ROI selection for a segmentation. Returns a controller with
 * a `destroy()` that removes its annotations, the 3D actor, and all listeners.
 */
export function createVolumeRoiController({ volumeId, segmentationId }) {
  // The single source of truth for the selection: each axis is null until a
  // rectangle pins it down. Mirrored to the voxel-manager bounds (below) only
  // once complete, so an incomplete selection reads as "nothing drawn".
  const box = { i: null, j: null, k: null };

  // Per-viewport state: depth axis, that pane's ROI UID, the last slice we
  // anchored to (so scroll-follow only fires on real slice changes), and the
  // IMAGE_RENDERED handler for cleanup.
  const perViewport = new Map();
  // Guards against reacting to annotation changes we make ourselves.
  let syncing = false;

  const engine = () => cornerstone.getRenderingEngines()[0];
  const volumeImageData = () =>
    cornerstone.cache.getVolume(volumeId)?.imageData;
  const segVoxelManager = () =>
    cornerstone.cache.getVolume(segmentationId)?.voxelManager;

  const orthoViewports = () => {
    const renderingEngine = engine();
    if (!renderingEngine) return [];
    return ORTHO_VIEWPORT_IDS.map((id) =>
      renderingEngine.getViewport(id),
    ).filter(Boolean);
  };
  const box3dViewport = () => engine()?.getViewport(BOX_3D_VIEWPORT_ID);

  const metaFor = (viewport) => {
    let meta = perViewport.get(viewport.id);
    if (!meta) {
      meta = { depthAxis: null, annotationUID: null, lastSlice: null };
      perViewport.set(viewport.id, meta);
    }
    if (meta.depthAxis === null) {
      const imageData = volumeImageData();
      if (imageData) meta.depthAxis = depthAxisFor(viewport, imageData);
    }
    return meta;
  };

  const trackedAnnotation = (meta) =>
    meta.annotationUID
      ? annotation.state.getAnnotation(meta.annotationUID)
      : null;

  // Attribute an annotation to its pane. Annotations are frame-of-reference
  // scoped, so all three ortho panes share one store — getAnnotations(element)
  // can't tell them apart. The annotation's own view-plane normal (captured when
  // it was drawn) does: it matches the pane whose camera looks down that normal.
  const findViewportForAnnotation = (ann) => {
    const normal = ann?.metadata?.viewPlaneNormal;
    if (!normal) return null;
    let best = null;
    let bestDot = -Infinity;
    orthoViewports().forEach((viewport) => {
      const n = viewport.getCamera().viewPlaneNormal;
      const alignment = Math.abs(
        n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2],
      );
      if (alignment > bestDot) {
        bestDot = alignment;
        best = viewport;
      }
    });
    return best;
  };

  // Point this pane's rectangle at the box's cross-section for the current
  // slice. A pane whose two in-plane axes aren't both pinned down yet has no
  // rectangle at all (this is what stops a one-pane draw from becoming a
  // full-height box elsewhere). Freshly created annotations have isVisible ===
  // undefined, which the move/resize hit-tests treat as non-interactable, so
  // mark it visible explicitly.
  const anchorPlane = (viewport, imageData, dims) => {
    const meta = metaFor(viewport);
    if (meta.depthAxis === null) return;

    const [a, b] = inPlaneAxes(meta.depthAxis);
    if (!box[AXIS_KEYS[a]] || !box[AXIS_KEYS[b]]) {
      // Not enough drawn yet to define this pane — drop any stale rectangle.
      if (meta.annotationUID) {
        annotation.state.removeAnnotation(meta.annotationUID);
        meta.annotationUID = null;
      }
      return;
    }

    const slice = currentSlice(viewport, imageData, meta.depthAxis, dims);
    const points = boxToPlanePoints(box, meta.depthAxis, slice, imageData);

    let ann = trackedAnnotation(meta);
    if (!ann) {
      ann = MaskRectangleRoiTool.createAnnotationForViewport(viewport, {
        data: { handles: { points }, cachedStats: {} },
      });
      annotation.state.addAnnotation(ann, viewport.element);
      annotation.config.style.setAnnotationStyles(
        ann.annotationUID,
        MASK_ROI_STYLE,
      );
      meta.annotationUID = ann.annotationUID;
    } else {
      ann.data.handles.points = points;
      // Re-home the plane metadata on the current slice so every display /
      // interaction filter treats it as on-slice as you scroll.
      Object.assign(ann.metadata, viewport.getViewReference());
    }
    annotation.visibility.setAnnotationVisibility(ann.annotationUID, true);
    ann.invalidated = true;
    meta.lastSlice = slice;
  };

  const drawActor = () => {
    const viewport = box3dViewport();
    if (!viewport) return;
    if (isBoxComplete(box)) {
      const volume = cornerstone.cache.getVolume(volumeId);
      addMaskBox(viewport, volume, box, BOX_3D_STYLE);
    } else {
      removeMaskBox(viewport);
    }
  };

  // Coalesce 3D box redraws to one per animation frame: a drag fires many
  // ANNOTATION_MODIFIED events per frame, and there's no point rendering the 3D
  // scene more than once. The box actor is updated in place (see maskBox), so
  // this stays smooth and live rather than lagging behind.
  let actorRaf = null;
  const scheduleActor = () => {
    if (actorRaf !== null) return;
    actorRaf = requestAnimationFrame(() => {
      actorRaf = null;
      drawActor();
    });
  };

  // Push the box to the voxel manager (read by handleAccept and the 3D actor)
  // only when complete; otherwise leave the bounds empty so an unfinished
  // selection can't be accepted.
  const commitBox = () => {
    const voxelManager = segVoxelManager();
    if (!voxelManager || !isBoxComplete(box)) return;
    voxelManager.setBounds([
      [box.i.min, box.i.max],
      [box.j.min, box.j.max],
      [box.k.min, box.k.max],
    ]);
  };

  // Re-point every pane (optionally skipping the one being edited) and redraw.
  const syncPlanes = (exceptViewportId) => {
    const imageData = volumeImageData();
    const dims = imageData?.getDimensions();
    if (!imageData || !dims) return;
    syncing = true;
    try {
      orthoViewports().forEach((viewport) => {
        if (viewport.id === exceptViewportId) return;
        anchorPlane(viewport, imageData, dims);
      });
    } finally {
      syncing = false;
    }
    cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds(
      orthoViewports().map((v) => v.id),
    );
  };

  // A user drew/moved/resized a rectangle: fold its two in-plane axes into the
  // shared box, then re-sync every other pane and the 3D box live.
  const onAnnotationChange = (evt) => {
    if (syncing) return;
    const ann = evt.detail?.annotation;
    if (ann?.metadata?.toolName !== ROI_TOOL_NAME) return;

    const viewport = findViewportForAnnotation(ann);
    if (!viewport) return;
    const imageData = volumeImageData();
    const dims = imageData?.getDimensions();
    const points = ann.data?.handles?.points;
    if (!imageData || !dims || !points?.length) return;

    const meta = metaFor(viewport);
    if (meta.depthAxis === null) return;

    // One rectangle per pane: drop any prior one this pane held.
    if (meta.annotationUID && meta.annotationUID !== ann.annotationUID) {
      annotation.state.removeAnnotation(meta.annotationUID);
    }
    meta.annotationUID = ann.annotationUID;
    annotation.config.style.setAnnotationStyles(ann.annotationUID, MASK_ROI_STYLE);
    annotation.visibility.setAnnotationVisibility(ann.annotationUID, true);

    // Fold in only this pane's two in-plane axes; the depth axis is owned by the
    // other panes and is never invented here.
    Object.assign(box, readInPlaneBounds(points, imageData, meta.depthAxis, dims));
    meta.lastSlice = currentSlice(viewport, imageData, meta.depthAxis, dims);

    commitBox();
    syncPlanes(viewport.id);
    scheduleActor();
    ensureScrollFollow();
  };

  // Keep each pane's rectangle on the current slice as it's scrolled — only on a
  // real slice change, never mid-drag (the slice is constant then, so this can't
  // fight an active edit).
  const onImageRendered = (viewport) => () => {
    if (syncing) return;
    const imageData = volumeImageData();
    const dims = imageData?.getDimensions();
    if (!imageData || !dims) return;
    const meta = metaFor(viewport);
    if (meta.depthAxis === null) return;
    const slice = currentSlice(viewport, imageData, meta.depthAxis, dims);
    if (slice === meta.lastSlice) return;
    syncing = true;
    try {
      anchorPlane(viewport, imageData, dims);
    } finally {
      syncing = false;
    }
    cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds([
      viewport.id,
    ]);
  };

  // Attach the scroll-follow listeners once the ortho viewports exist. Idempotent.
  const ensureScrollFollow = () => {
    orthoViewports().forEach((viewport) => {
      const meta = metaFor(viewport);
      if (meta.imageRenderedHandler) return;
      const handler = onImageRendered(viewport);
      meta.imageRenderedHandler = handler;
      viewport.element.addEventListener(csEvents.IMAGE_RENDERED, handler);
    });
  };

  cornerstone.eventTarget.addEventListener(
    csToolsEvents.ANNOTATION_MODIFIED,
    onAnnotationChange,
  );
  cornerstone.eventTarget.addEventListener(
    csToolsEvents.ANNOTATION_COMPLETED,
    onAnnotationChange,
  );
  // Viewports may not exist yet on first mount; the annotation handlers also call
  // this, so scroll-follow attaches as soon as the first box is drawn.
  ensureScrollFollow();

  return {
    destroy() {
      if (actorRaf !== null) cancelAnimationFrame(actorRaf);
      cornerstone.eventTarget.removeEventListener(
        csToolsEvents.ANNOTATION_MODIFIED,
        onAnnotationChange,
      );
      cornerstone.eventTarget.removeEventListener(
        csToolsEvents.ANNOTATION_COMPLETED,
        onAnnotationChange,
      );
      perViewport.forEach((meta, viewportId) => {
        const viewport = engine()?.getViewport(viewportId);
        if (viewport && meta.imageRenderedHandler) {
          viewport.element.removeEventListener(
            csEvents.IMAGE_RENDERED,
            meta.imageRenderedHandler,
          );
        }
        if (meta.annotationUID) {
          annotation.state.removeAnnotation(meta.annotationUID);
        }
      });
      perViewport.clear();
      const viewport3d = box3dViewport();
      if (viewport3d) removeMaskBox(viewport3d);
    },
  };
}
