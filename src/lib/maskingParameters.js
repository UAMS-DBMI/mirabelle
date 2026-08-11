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
