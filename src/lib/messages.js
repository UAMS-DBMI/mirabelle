/**
 * Central catalog of all user-facing copy in Mirabelle.
 *
 * Keeping every message in one place keeps tone, casing, and punctuation
 * consistent and makes copy easy to review or localize later. Prefer adding
 * a string here over hardcoding one at a call site.
 */

// 1184 -> "1,184"
const count = (n) => n.toLocaleString();

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
    flatSelection:
      "Can't expand a flat selection — draw in at least two planes first.",
    expandFirst: "Expand the selection before accepting.",
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

  // Decimation skips slices, and PHI on a skipped slice is never shown.
  decimation: {
    slicesShown: (shown, total) =>
      `${count(shown)} of ${count(total)} slices shown`,
    slicesHidden: (hidden) =>
      `${count(hidden)} hidden. PHI on them won't be seen.`,
    offTitle: "Decimate is off",
    offAllShown: (total) => `All ${count(total)} slices shown.`,
    offNoExam: "Every slice will be loaded.",

    // Hover details, explaining where the shown count comes from.
    details: {
      title: "How Decimate works",
      chosen: (total, max) =>
        `This series has ${count(total)} slices, and Decimate is set to ` +
        `${count(max)}: the most slices to load.`,
      overLimit: (total, max) =>
        `This series has ${count(total)} slices, more than the viewer's ` +
        `limit of ${count(max)}.`,
      evenSpacing: (step, max, shown) =>
        "Slices are kept at an even step (1 in 2, 1 in 3, and so on) so " +
        `masks line up exactly. 1 in ${step} is the smallest step that ` +
        `fits within ${count(max)}, which keeps ${count(shown)} slices ` +
        "(the last slice is always kept).",
      sameResult: (from, to, shown) =>
        `So any value from ${count(from)} to ${count(to)} gives ` +
        `${count(shown)} slices for this series.`,
      otherChoices: (choices) => `Other choices here: ${choices.join("; ")}.`,
      choiceAll: (from, total) =>
        `${count(from)} or more loads all ${count(total)}`,
      choiceRange: (from, to, shown) =>
        `${count(from)}–${count(to)} gives ${count(shown)}`,
      hidden: (hidden) =>
        `The other ${count(hidden)} are never loaded, so PHI on them ` +
        "(burned-in text, faces) won't be seen.",
      turnOff: "Set Decimate to 0 to turn it off.",

      // Shown on the "Decimate is off" callout, when nothing was skipped.
      general: {
        intro:
          "Decimate sets the most slices to load for each series. 0 turns " +
          "it off.",
        evenSpacing:
          "Slices are kept at an even step (1 in 2, 1 in 3, and so on) so " +
          "masks line up exactly: the smallest step that fits within that " +
          "number. The last slice is always kept.",
        example:
          "So several values give the same result. Example: for 148 " +
          "slices, anything from 74 to 147 keeps 1 in 2, which is 75 slices.",
        hidden:
          "Skipped slices are never loaded, so PHI on them (burned-in text, " +
          "faces) won't be seen.",
      },
    },
  },

  // Neutral viewport empty states (never styled as errors).
  viewport: {
    noImage: "No image to display",
  },

  // Errors. `generic` is the safe fallback when nothing more specific applies.
  errors: {
    generic: "Something went wrong. Please try again.",
    loadImage: "Couldn't load this image.",
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
