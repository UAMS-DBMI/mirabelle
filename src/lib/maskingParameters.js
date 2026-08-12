/**
 * Formatting for the `masking_parameters` blob the masking API returns, e.g.
 * {"IS":783,"LR":249,"PA":258,"form":"cylinder","depth":155,"width":215,
 *  "height":254,"function":"mask"}
 *
 * The blob is stored as a JSON *string* and its exact key set varies by
 * masking function (noise/fill only exist for the blur-style functions), so
 * the details panel renders whatever is present rather than a fixed table.
 * Geometry is in patient-space millimetres: LR/PA/IS is the box centre and
 * width/height/depth its extent along those same axes (see
 * masking.js submitFinalCoords).
 */

const SEPARATOR = " ● ";

// Keys rendered by a dedicated row below; anything else falls through to
// "Other Parameters" so a new backend field shows up instead of vanishing.
const KNOWN_KEYS = [
  "function",
  "form",
  "noise",
  "fill",
  "LR",
  "PA",
  "IS",
  "width",
  "height",
  "depth",
];

/**
 * Parse the raw `masking_parameters` string. Returns null when the field is
 * absent or unparseable — an IEC that has never been masked has no parameters,
 * which is normal, so this must not throw and take the whole panel down.
 */
export function parseMaskingParameters(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[maskingParameters] unparseable masking_parameters:", error);
    return null;
  }
}

function isPresent(value) {
  return value !== undefined && value !== null && value !== "";
}

// The blob's geometry keys, in IJK axis order: LR/PA/IS is the box centre and
// width/height/depth its extent, both in millimetres (see submitFinalCoords).
const CENTER_KEYS = ["LR", "PA", "IS"];
const SIZE_KEYS = ["width", "height", "depth"];

function clampBound(value, size) {
  return Math.max(0, Math.min(value, size - 1));
}

// The blob's centre and extent as numbers, or null when any of the six is
// missing/unparseable (an exam whose parameters carry no geometry).
function readCenterAndSize(params) {
  const center = CENTER_KEYS.map((key) => Number(params[key]));
  const size = SIZE_KEYS.map((key) => Number(params[key]));
  return center.every(Number.isFinite) && size.every(Number.isFinite)
    ? { center, size }
    : null;
}

// Round per-axis index ranges into {i,j,k} bounds, rejecting a box wholly off
// the volume: better to draw nothing than a sliver pinned to the edge that
// reads as a real mask.
function boundsFromRanges(ranges, dimensions) {
  const axes = ranges.map((range, axis) => {
    const dimension = Number(dimensions[axis]);
    if (!range || !Number.isFinite(dimension) || dimension < 1) return null;
    const min = Math.round(range[0]);
    const max = Math.round(range[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (max < 0 || min > dimension - 1) return null;
    return { min: clampBound(min, dimension), max: clampBound(max, dimension) };
  });
  return axes.every(Boolean) ? { i: axes[0], j: axes[1], k: axes[2] } : null;
}

// Convention 1 — the exact inverse of masking.js submitFinalCoords, which is
// how THIS APP submits: origin-relative index×spacing per IJK axis, no origin,
// no direction ("LR" is really "the i axis in mm", whatever the patient axis
// the volume's i actually runs along). Dividing by the CURRENT volume's
// spacing is what makes this survive decimation: a decimated volume has
// proportionally larger spacing, so the same millimetre offset lands on the
// equivalent slice of whatever is loaded now.
function boundsFromIndexRelative({ center, size }, geometry) {
  const { spacing, dimensions } = geometry;
  const ranges = [0, 1, 2].map((axis) => {
    const step = Number(spacing?.[axis]);
    if (!Number.isFinite(step) || step <= 0) return null;
    return [
      (center[axis] - size[axis] / 2) / step,
      (center[axis] + size[axis] / 2) / step,
    ];
  });
  return boundsFromRanges(ranges, dimensions);
}

// Map a patient-space axis-aligned box (given by its world-mm centre and
// extent, plus an optional world offset added to the centre) through the
// loaded geometry's world→index transform: the box's 8 corners go through
// worldToIndex (which applies origin and direction, so sagittal/coronal/
// oblique volumes permute the axes correctly) and the index-space bounding box
// of the result is kept. `singleSlice` relaxes the through-plane test for a
// one-image stack: the pipeline stores a 3D box even for a 2D image and
// applies it in-plane, so the depth axis must not veto the whole overlay.
function boundsFromPatientBox({ center, size }, geometry, offset) {
  const { worldToIndex, dimensions, singleSlice } = geometry;
  if (typeof worldToIndex !== "function") return null;

  const ranges = [null, null, null];
  for (let corner = 0; corner < 8; corner += 1) {
    const world = [0, 1, 2].map(
      // Bit a of the corner index picks the low/high face on axis a.
      (axis) =>
        (offset?.[axis] ?? 0) +
        center[axis] +
        (size[axis] / 2) * (corner & (1 << axis) ? 1 : -1),
    );
    const index = worldToIndex(world);
    if (!index || index.some((value) => !Number.isFinite(value))) return null;
    [0, 1, 2].forEach((axis) => {
      const range = ranges[axis] ?? [Infinity, -Infinity];
      ranges[axis] = [
        Math.min(range[0], index[axis]),
        Math.max(range[1], index[axis]),
      ];
    });
  }
  if (singleSlice) {
    ranges[2] = [0, 0];
  }
  return boundsFromRanges(ranges, dimensions);
}

// Convention 2 — patient-axis millimetres measured from the volume's
// patient-space bounding-box corner: how the pipeline's auto-created masks
// (status "created") store the box. Values like IS:1504 are positions inside a
// whole-body volume's ~1700mm extent, not scanner table coordinates — every
// observed auto mask fits this reading, and none fit raw scanner world.
function boundsFromCornerRelative(box, geometry) {
  const { worldBoundsMin } = geometry;
  if (!worldBoundsMin) return null;
  return boundsFromPatientBox(box, geometry, worldBoundsMin);
}

// Convention 3 — LR/PA/IS as raw scanner-world coordinates. Kept as a last
// resort for masks written in true world space; no observed exam has needed
// it, but it costs nothing and catches a backend that stores DICOM positions
// verbatim.
function boundsFromWorld(box, geometry) {
  return boundsFromPatientBox(box, geometry, null);
}

/**
 * The IJK bounding box a stored `masking_parameters` blob describes, for the
 * volume currently loaded.
 *
 * Several coordinate conventions coexist in this field, so the readings are
 * tried in order until one lands on the volume:
 *
 *   1. Origin-relative index×spacing — what this app's submitFinalCoords
 *      writes. Tried first so masks submitted here always round-trip exactly.
 *   2. Patient-axis mm from the volume's bounding-box corner — what the
 *      pipeline's auto-created masks carry (its giveaway: offsets like
 *      IS:1504 that can never be index×spacing for the loaded extent).
 *   3. Raw scanner-world coordinates, as a last resort.
 *
 * The residual ambiguity is a mask in one convention whose offsets happen to
 * also fit the volume under an earlier reading — that reading wins and the box
 * lands shifted. Nothing in the blob distinguishes the conventions; if the
 * backend ever stamps one, switch on that instead.
 *
 * Returns null when there is nothing to draw: no parameters (an exam that has
 * never been masked), an incomplete blob, unusable geometry, or a box that
 * falls entirely outside the loaded volume under every reading.
 *
 * @param {string|object|null} raw The `masking_parameters` field as returned.
 * @param {{spacing: number[], dimensions: number[],
 *   worldToIndex?: (world: number[]) => number[],
 *   worldBoundsMin?: number[], singleSlice?: boolean}} geometry The loaded
 *   volume's IJK spacing (mm) and dimensions (voxels); its world→index
 *   transform and patient-space bounding-box corner for readings 2–3 (either
 *   omitted skips the readings that need it); and whether this is a one-image
 *   stack, which relaxes the through-plane test in the patient-box readings.
 */
export function maskingParametersToBounds(raw, geometry) {
  const params = parseMaskingParameters(raw);
  if (!params || !geometry?.dimensions) return null;
  const box = readCenterAndSize(params);
  if (!box) return null;

  return (
    boundsFromIndexRelative(box, geometry) ??
    boundsFromCornerRelative(box, geometry) ??
    boundsFromWorld(box, geometry)
  );
}

function formatFunction(params) {
  if (!isPresent(params.function)) return null;
  // The API stores the slice-remove function unhyphenated.
  const name =
    params.function === "sliceremove" ? "slice-remove" : params.function;
  return isPresent(params.form) ? `${name}${SEPARATOR}${params.form}` : name;
}

function formatFilters(params) {
  if (!isPresent(params.noise)) return null;
  return `Noise: ${params.noise}${SEPARATOR}Fill: ${params.fill}`;
}

function formatCenter(params) {
  const parts = ["LR", "PA", "IS"]
    .filter((axis) => isPresent(params[axis]))
    .map((axis) => `${axis}: ${params[axis]}`);
  return parts.length > 0 ? parts.join(SEPARATOR) : null;
}

function formatSize(params) {
  const parts = ["width", "height", "depth"]
    .filter((key) => isPresent(params[key]))
    .map((key) => params[key]);
  return parts.length === 3 ? `${parts.join(" × ")} mm (W × H × D)` : null;
}

function formatOtherParameters(params) {
  const parts = Object.entries(params)
    .filter(([key, value]) => !KNOWN_KEYS.includes(key) && isPresent(value))
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? parts.join(SEPARATOR) : null;
}

/**
 * Label → value rows for the details panel. Rows with no data are omitted so
 * the panel never shows an empty box for a parameter this mask doesn't use.
 */
export function describeMaskingParameters(raw) {
  const params = parseMaskingParameters(raw);
  if (!params) return {};

  const rows = {
    "Masking Function": formatFunction(params),
    "Masking Filters": formatFilters(params),
    "Mask Center": formatCenter(params),
    "Mask Size": formatSize(params),
    "Other Parameters": formatOtherParameters(params),
  };

  return Object.fromEntries(
    Object.entries(rows).filter(([, value]) => value !== null),
  );
}
