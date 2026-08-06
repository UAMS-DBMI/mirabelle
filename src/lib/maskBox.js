/**
 * Renders the masking selection as a box in a 3D viewport.
 *
 * The mask labelmap always fills the selection's IJK bounding box edge-to-edge,
 * so the masked region is a box. We draw that box explicitly rather than
 * deriving a surface from the labelmap. This decouples the 3D preview from the
 * labelmap, which lets the labelmap (and the submitted mask) reach the very
 * edge of the volume — a labelmap-derived surface can't, because marching
 * cubes produces no isosurface for a region touching the grid edge.
 *
 * The box is drawn in two halves:
 *
 *   - Its EDGES are a vtk wireframe actor, so the volume occludes them where
 *     it sits in front — that's what makes the box read as enclosing the
 *     anatomy rather than floating over it.
 *   - Its FACES ("the glass fill") are blended into the volume's own ray
 *     march by the mask-box mapper plugin (see lib/maskBoxVolumeMapper): the
 *     patched volume shader tints every ray sample that falls within a thin
 *     shell of the box's faces, driven by uniforms.
 *
 * The fill has to live inside the ray march; both obvious alternatives fail:
 *
 *   - Filled vtk geometry, at any opacity, is captured into vtkForwardPass's
 *     depth texture (its zBufferPass renders translucent actors too), and the
 *     volume mapper terminates its rays at that depth — the volume is never
 *     rendered behind a face, so the face blends against the background and
 *     reads as solid.
 *   - A DOM/SVG overlay composites over the finished frame, so it tints
 *     everything inside the box's silhouette — including anatomy in FRONT of
 *     the box.
 *
 * Being sampled inside the same ray-cast as the anatomy makes it correct in
 * every direction: anatomy in front occludes it, anatomy inside shows through
 * it, and it fades what's behind it. An earlier implementation achieved the
 * same correctness by writing the shell into a second interleaved voxel
 * component, but that doubled the volume into a float copy on the CPU and the
 * GPU — moving the fill meant texture uploads, and exams past ~0.5 GB hit
 * WebGL's silent allocation failure and lost the anatomy entirely. The shader
 * plugin needs six floats instead, so the fill works on every exam size and
 * moving it costs one re-render.
 */

import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import { Representation } from "@kitware/vtk.js/Rendering/Core/Property/Constants";

import { ensureMaskBoxMapper } from "@/lib/maskBoxVolumeMapper";

// Stable id so the box can be found, replaced, and removed on a viewport.
const MASK_BOX_ACTOR_UID = "mask-selection-box";

/**
 * The one green the whole selection is drawn in, 0-1 per channel as vtk wants
 * — equivalently rgb(74, 222, 128). The 3D box's edges and the 2D panes'
 * outlines both use it directly (MaskIEC derives its CSS colour from this
 * export) so the same selection can't end up two different shades of green
 * depending on which pane you look at.
 */
export const SELECTION_EDGE_COLOR = [0.29, 0.871, 0.502];

// The glass faces are drawn darker than the edges so the edges read as a
// drawn outline sitting on top of them instead of dissolving into them.
const FILL_DARKEN = 0.75;

/** Face colour of the 3D box's glass, a darker shade of the edge green. */
export const SELECTION_FILL_COLOR = SELECTION_EDGE_COLOR.map(
  (channel) => channel * FILL_DARKEN,
);

// Shared style defaults for addMaskBox / setMaskBoxStyle.
const DEFAULT_STYLE = {
  color: SELECTION_EDGE_COLOR,
  width: 2,
  opacity: 1,
  fillColor: SELECTION_FILL_COLOR,
  fillAlpha: 0.15,
};

// Per-axis brightness for the three pairs of opposing faces, so the box
// shades like an isometric cube instead of rendering as one flat green
// silhouette. Values are relative to fillColor.
const FACE_SHADE = [1.0, 0.82, 0.66];

// How far the 12 edges are lifted toward white. This is what gives the glass
// a crisp drawn outline where faces meet.
const EDGE_BOOST = 0.32;

// Ceiling on the glass panes' PER-SAMPLE opacity, at slider 100%. High
// enough that the few samples a ray takes crossing a pane accumulate to
// effectively opaque — at the top of the slider the box has to actually
// block the anatomy, since that is the curator's preview of the region being
// removed. Kept just under 1 so a pane still darkens where a ray grazes
// along it rather than crossing it, which is the cue that reads as glass
// rather than as painted-on plastic.
const MAX_FILL_ALPHA = 0.97;

// Per-sample opacity of the box's INTERIOR at slider 100%. Opaque faces
// alone leave the region see-through wherever a face is missing — clipped by
// the volume edge, or under a MIP preset, which colours only the single
// brightest sample along each ray instead of accumulating along it. That
// second case is why this is high rather than faint: under MIP the interior
// gets exactly one sample to block with, so a low value would barely tint.
// It costs nothing under normal (composite) presets, where by the time the
// interior fills in at all the panes are already ~95% opaque on their own,
// so the ray has stopped at the front face long before reaching here.
const MAX_CORE_ALPHA = 0.9;

// Where on the slider the interior starts filling in. Below this the box is
// a hollow glass shell you can inspect the anatomy through; above it the box
// progressively becomes a solid block — the mask result rather than the mask
// outline.
const CORE_FILL_START = 0.7;

// Smooth 0→1 ramp between two thresholds (the GLSL smoothstep curve).
function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// The box currently shown per 3D viewport (IJK bounds), so style-only
// changes (the mask opacity slider) can re-apply the fill without being
// handed the coords again. Cleared on removeMaskBox, which is what keeps a
// restyle from resurrecting a hidden box.
const FILL_BOXES = new WeakMap();

// How thick (in voxels) the glass shell around the box's faces is. Thin
// enough to read as panes, thick enough that the ray march can't step across
// a face between samples at full quality.
const SHELL_THICKNESS = 2;

// A drag preview renders at PREVIEW_SAMPLE_SCALE× coarser sampling, whose
// longer ray steps would skip a 2-voxel shell — so previews thicken the
// shell by the same factor. The commit redraws the exact shell.
const PREVIEW_SHELL_SCALE = 2;

// Ray-march quality is dropped by this factor while a drag preview is in
// flight (see enterPreviewQuality) — the volume re-render per preview tick
// is the whole cost of a drag now that the fill itself is just uniforms.
// 2× is a mild, barely-noisy degradation.
const PREVIEW_SAMPLE_SCALE = 2;

// Viewports currently rendering at preview quality: the mapper whose sample
// distance was scaled, and the value to restore on commit.
const PREVIEW_QUALITY = new WeakMap();

// The 8 corners of a cube as (i, j, k) ∈ {0, 1} offsets, where 0 picks the
// low (min) face and 1 the high (max) face along that axis.
const CUBE_CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

// The 6 quad faces, each as 4 indices into CUBE_CORNERS (wound consistently).
const CUBE_FACES = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [1, 2, 6, 5],
  [0, 3, 7, 4],
];

/**
 * World-space positions of the box's 8 corners, as a flat [x,y,z,...] array.
 *
 * The IJK bounds are voxel indices, so we expand by half a voxel on each side
 * to put the faces on voxel boundaries — that way the box reaches the true edge
 * of the volume when the selection spans it. indexToWorld applies the volume's
 * origin/spacing/direction, so the box stays aligned even for oblique volumes.
 */
function boxCornerPoints(imageData, coords) {
  const lo = [coords.i.min - 0.5, coords.j.min - 0.5, coords.k.min - 0.5];
  const hi = [coords.i.max + 0.5, coords.j.max + 0.5, coords.k.max + 0.5];

  const points = new Float32Array(CUBE_CORNERS.length * 3);
  CUBE_CORNERS.forEach(([ci, cj, ck], index) => {
    const ijk = [ci ? hi[0] : lo[0], cj ? hi[1] : lo[1], ck ? hi[2] : lo[2]];
    const world = imageData.indexToWorld(ijk, [0, 0, 0]);
    points.set(world, index * 3);
  });
  return points;
}

// vtk cell array format: each face is prefixed with its vertex count.
function boxFaceCells() {
  const cells = [];
  CUBE_FACES.forEach((face) => cells.push(face.length, ...face));
  return Uint16Array.from(cells);
}

/**
 * The viewport's anatomy volume actor. Never assume it's the first actor
 * (getDefaultActor): setVolumesForViewports is awaited after enableElement,
 * so the box wireframe can land on the viewport before the volume actor does
 * — anything keyed to "first actor" then misses the volume for good.
 */
function getVolumeActor(viewport) {
  const entry = viewport
    .getActors?.()
    ?.find((item) => item?.actor?.isA?.("vtkVolume"));
  return entry?.actor ?? null;
}

// Per-sample alpha of the fill for a given box opacity. A plain
// fillAlpha × opacity product caps out at fillAlpha, so the slider's top end
// could never be more than faint glass. This ramps quadratically from
// invisible at 0, through the glass look at the low-mid range, to
// MAX_FILL_ALPHA at 100% — which accumulates across the shell into a strongly
// saturated pane while keeping the box translucent (see MAX_FILL_ALPHA).
function fillAlphaForOpacity(fillAlpha, opacity) {
  const clamped = Math.max(0, Math.min(1, opacity));
  return clamped * (fillAlpha + clamped * (MAX_FILL_ALPHA - fillAlpha));
}

// Per-sample opacity of the box interior — zero (hollow glass shell) until
// the slider passes CORE_FILL_START, then ramping in so the top of the
// slider blocks the region out entirely.
function coreAlphaForOpacity(opacity) {
  const clamped = Math.max(0, Math.min(1, opacity));
  return MAX_CORE_ALPHA * smoothstep(CORE_FILL_START, 1, clamped);
}

/**
 * Point the shader fill at `coords`, converting the IJK bounds to the
 * normalized texture coordinates the patched shader works in. The box's
 * faces sit on voxel boundaries (index min − 0.5 → normalized min/dim),
 * matching the wireframe's corner convention exactly. previewScale thickens
 * the shell while a coarse-sampled drag preview is running.
 */
function applyFill(viewport, coords, style, previewScale = 1) {
  const mapper = ensureMaskBoxMapper(getVolumeActor(viewport));
  const dims = mapper?.getInputData?.()?.getDimensions?.();
  if (!dims || !dims[0] || !dims[1] || !dims[2]) {
    return;
  }
  const thickness = SHELL_THICKNESS * previewScale;
  mapper.setMaskBoxParams({
    enabled: true,
    boxMin: [
      coords.i.min / dims[0],
      coords.j.min / dims[1],
      coords.k.min / dims[2],
    ],
    boxMax: [
      (coords.i.max + 1) / dims[0],
      (coords.j.max + 1) / dims[1],
      (coords.k.max + 1) / dims[2],
    ],
    thickness: [
      thickness / dims[0],
      thickness / dims[1],
      thickness / dims[2],
    ],
    color: style.fillColor,
    alpha: fillAlphaForOpacity(style.fillAlpha, style.opacity),
    coreAlpha: coreAlphaForOpacity(style.opacity),
    faceShade: FACE_SHADE,
    edgeBoost: EDGE_BOOST,
  });
}

// Turn the shader fill off, if this viewport's volume actor carries the
// mask-box mapper. Never creates the mapper — removal must not convert.
function disableFill(viewport) {
  const mapper = getVolumeActor(viewport)?.getMapper?.();
  if (mapper?.isA?.("vtkMaskBoxVolumeMapper")) {
    mapper.setMaskBoxParams(null);
    return true;
  }
  return false;
}

function removeWireframeActor(viewport) {
  if (!viewport.getActor(MASK_BOX_ACTOR_UID)) {
    return false;
  }
  viewport.removeActors([MASK_BOX_ACTOR_UID]);
  return true;
}

// Trade ray-march quality for speed while a drag preview is in flight: a
// coarser sample distance makes each preview re-render ~PREVIEW_SAMPLE_SCALE×
// cheaper, which is what keeps the drag responsive. Restored on commit
// (exitPreviewQuality), so the settled image is full quality.
function enterPreviewQuality(viewport) {
  if (PREVIEW_QUALITY.has(viewport)) return;
  const mapper = getVolumeActor(viewport)?.getMapper?.();
  if (typeof mapper?.getSampleDistance !== "function") return;
  const sampleDistance = mapper.getSampleDistance();
  PREVIEW_QUALITY.set(viewport, { mapper, sampleDistance });
  mapper.setSampleDistance(sampleDistance * PREVIEW_SAMPLE_SCALE);
}

function exitPreviewQuality(viewport) {
  const saved = PREVIEW_QUALITY.get(viewport);
  if (!saved) return;
  PREVIEW_QUALITY.delete(viewport);
  // No-op if navigation already swapped the actor: the saved mapper died with
  // it, and the replacement was created at full quality.
  saved.mapper.setSampleDistance(saved.sampleDistance);
}

/**
 * Add (or replace) the selection box on a 3D viewport.
 *
 * @param {object} viewport A cornerstone VOLUME_3D viewport.
 * @param {object} volume The cornerstone volume the box is measured against
 *   (its imageData defines the IJK→world transform).
 * @param {{i,j,k}} coords IJK min/max bounds (from getLabelmapBounds).
 * @param {{color?: [number,number,number], width?: number, opacity?: number,
 *   fillColor?: [number,number,number], fillAlpha?: number,
 *   previewOnly?: boolean}} [options] `color`/`width` style the wireframe
 *   edges; `fillColor`/`fillAlpha` the in-raymarch fill. `opacity` scales
 *   both. `previewOnly` drives the live drag preview: the wireframe and the
 *   fill both move to the previewed bounds (the fill is uniforms now, so a
 *   move costs one re-render), the render drops to a coarser sample
 *   distance, and the shell thickens so the coarse ray-march still hits its
 *   panes. The commit's non-preview call redraws the exact final state at
 *   full quality.
 */
export function addMaskBox(viewport, volume, coords, options = {}) {
  const {
    color = DEFAULT_STYLE.color,
    width = DEFAULT_STYLE.width,
    opacity = DEFAULT_STYLE.opacity,
    fillColor = DEFAULT_STYLE.fillColor,
    fillAlpha = DEFAULT_STYLE.fillAlpha,
    previewOnly = false,
  } = options;

  // The wireframe is rebuilt (removed + re-added) on every call, previews
  // included. Mutating the existing actor's polydata points in place does not
  // reliably show up on the 3D volume viewport even with the mtimes bumped —
  // confirmed twice now, so don't retry it. The rebuild itself is cheap next
  // to the volume ray-cast the render performs either way.
  removeWireframeActor(viewport);

  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(boxCornerPoints(volume.imageData, coords), 3);
  polyData.getPolys().setData(boxFaceCells());

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const property = actor.getProperty();
  // WIREFRAME draws the quad faces as their outlines, giving the 12 box edges.
  // (vtk has no rounded-cube primitive, so the corners stay square; the edges
  // are what make it read as a deliberate box rather than a flat slab.)
  property.setRepresentation(Representation.WIREFRAME);
  property.setColor(...color);
  property.setLineWidth(width);
  property.setOpacity(opacity);
  // Shading would dim the edges facing away from the light, and an edge that
  // fades out stops delineating the selection.
  property.setLighting(false);

  viewport.addActor({ uid: MASK_BOX_ACTOR_UID, actor });

  const style = { fillColor, fillAlpha, opacity };
  FILL_BOXES.set(viewport, coords);
  if (previewOnly) {
    applyFill(viewport, coords, style, PREVIEW_SHELL_SCALE);
    enterPreviewQuality(viewport);
  } else {
    exitPreviewQuality(viewport);
    applyFill(viewport, coords, style);
  }

  viewport.render();
}

/**
 * Restyle the box already on a 3D viewport in place — wireframe paint and
 * fill uniforms only, no actor rebuild — so live controls (the mask opacity
 * slider) cost one re-render instead of a full teardown. No-ops for anything
 * not currently shown; in particular the fill is only touched while its
 * wireframe is up, so restyling can't resurrect a hidden box.
 */
export function setMaskBoxStyle(viewport, options = {}) {
  const {
    color = DEFAULT_STYLE.color,
    width = DEFAULT_STYLE.width,
    opacity = DEFAULT_STYLE.opacity,
    fillColor = DEFAULT_STYLE.fillColor,
    fillAlpha = DEFAULT_STYLE.fillAlpha,
  } = options;

  const wireframe = viewport.getActor(MASK_BOX_ACTOR_UID)?.actor;
  if (!wireframe) {
    return;
  }

  const property = wireframe.getProperty();
  property.setColor(...color);
  property.setLineWidth(width);
  property.setOpacity(opacity);

  const coords = FILL_BOXES.get(viewport);
  if (coords) {
    applyFill(viewport, coords, { fillColor, fillAlpha, opacity });
  }

  viewport.render();
}

/** Remove the selection box from a 3D viewport, if present. */
export function removeMaskBox(viewport) {
  let changed = removeWireframeActor(viewport);
  exitPreviewQuality(viewport);
  FILL_BOXES.delete(viewport);

  if (disableFill(viewport)) {
    changed = true;
  }

  if (changed) {
    viewport.render();
  }
}
