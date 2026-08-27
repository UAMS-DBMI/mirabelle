/**
 * Central catalog of all user-facing copy in Mirabelle.
 *
 * Keeping every message in one place keeps tone, casing, and punctuation
 * consistent and makes copy easy to review or localize later. Prefer adding
 * a string here over hardcoding one at a call site.
 */

export const messages = {
  // Review status confirmations (DICOM / NIfTI).
  status: {
    set: (label) => `Status set to ${label}`,
    flaggedForMasking: "Flagged for masking",
  },

  // Masking workflow confirmations.
  mask: {
    accepted: "Mask accepted",
    rejected: "Mask rejected",
    skipped: "Mask skipped",
    notMaskable: "Marked as not maskable",
    expanded: "Selection expanded",
    submitted: "Submitted for masking",
  },

  // Masking workflow validation (user needs to do something first).
  maskValidation: {
    emptySelection: "Draw a selection before accepting.",
    notABox:
      "The selection must be a 3D box — draw across at least two planes, not a single slice.",
  },

  // List navigation (next / previous item).
  navigation: {
    noNext: (noun = "item") => `No next ${noun} available.`,
    noPrevious: (noun = "item") => `No previous ${noun} available.`,
  },

  // Filtering / list loading.
  filters: {
    noResults: "No results were found for the selected filters.",
    loadFailed: "Couldn't load the list. Please try again.",
  },

  // Loading indicators.
  loading: {
    segVolume: "Loading volume for segmentation…",
  },

  // Informational notices (non-error feedback about what happened).
  info: {
    segNoBaseImage: (iec) =>
      `No matching image series was found for segmentation IEC ${iec}; ` +
      `showing the segmentation on its own.`,
  },

  // Neutral viewport empty states (never styled as errors).
  viewport: {
    noImage: "No image to display",
  },

  // Errors. `generic` is the safe fallback when nothing more specific applies.
  errors: {
    generic: "Something went wrong. Please try again.",
    loadImage: "Couldn't load this image.",
    framesFailed:
      "Some images failed to download. Use “Reload Image” to retry.",
    saveStatus: "Couldn't save the status. Please try again.",
    submitMask: "Couldn't submit the mask. Please try again.",
    network: "Couldn't reach the server. Check your connection and try again.",
    downloadFailed: "Couldn't download the file. Please try again.",
    missingNiftiFile: "No downloadable NIfTI file was found for this record.",
    loginFailed: "Not logged in. Please login to Posda first.",
    multipleSegImages: (iec) =>
      `More than one segmentation image was found for IEC ${iec}.`,
    segLoadError: `This segmentation file could not be loaded. 
                   It may be corrupted or use an unsupported format.
                   The volume will display, but no SEG will be overlayed!`, 
  },
};

export default messages;
