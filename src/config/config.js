// config.js

// Base default configuration that applies to all routes
const BASE_DEFAULTS = {
  layout: "",
  viewport_layout: "volume", // 'volume' or 'stack'
  title: "",
  nifti: false,

  // left Panel
  // ----------------------------------
  leftPanelVisible: false,
  leftPanelOpen: false,

  // -- files panel
  filesPanelVisible: false,

  // -- tools panel
  toolsPanelVisible: false,

  viewToolGroupVisible: false,
  viewToolGroupValue: "volume", // 'volume' or 'projection' or 'stack'
  viewToolVolumeVisible: false,
  viewToolProjectionVisible: false,
  viewToolStackVisible: false,

  functionToolGroupVisible: false,
  functionToolGroupValue: "mask", // 'mask' or 'blackout' or 'slice-remove'
  functionToolMaskVisible: false,
  functionToolBlackoutVisible: false,
  functionToolSliceRemoveVisible: false,

  formToolGroupVisible: false,
  formToolGroupValue: "cylinder", // 'cuboid' or 'cylinder'
  formToolCuboidVisible: false,
  formToolCylinderVisible: false,

  leftClickToolGroupVisible: false,
  leftClickToolGroupValue: "selection", // 'selection' or 'windowlevel' or 'crosshairs'
  leftClickToolWindowLevelVisible: false,
  leftClickToolCrossHairsVisible: false,
  leftClickToolRectangleScissorsVisible: false,

  rightClickToolGroupVisible: false,
  rightClickToolGroupValue: "zoom", // 'zoom' or 'pan'
  rightClickToolZoomVisible: false,
  rightClickToolPanVisible: false,

  opacityToolVisible: false,
  opacityToolMin: 0,
  opacityToolMax: 1,
  opacityToolStep: 0.01,
  opacityToolValue: 0.3,

  presetToolVisible: false,
  presetToolList: [],
  presetToolValue: "CT-MIP",

  resetViewportsVisible: false,
  resetViewportsValue: false,

  // right panel
  // ----------------------------------
  rightPanelVisible: false,
  rightPanelOpen: false,

  // -- description panel
  descriptionPanelVisible: false,

  // top panel
  // ----------------------------------
  topPanelVisible: false,

  // -- navigation panel
  navigationPanelVisible: false,
  // -- search panel
  searchPanelVisible: false,

  // bottom panel
  // ----------------------------------
  bottomPanelVisible: false,

  // -- masker panel
  maskerPanelVisible: false,
  maskerPanelExpandSelectionVisible: false,
  maskerPanelClearSelectionVisible: false,
  maskerPanelAcceptSelectionVisible: false,

  // -- masker review panel
  maskerReviewPanelVisible: false,
  maskerReviewPanelAcceptedVisible: false,
  maskerReviewPanelRejectedVisible: false,
  maskerReviewPanelSkipVisible: false,
  maskerReviewPanelNonMaskableVisible: false,

  // -- visual review panel
  visualReviewPanelVisible: false,
  visualReviewPanelGoodVisible: false,
  visualReviewPanelBadVisible: false,
  visualReviewPanelBlankVisible: false,
  visualReviewPanelScoutVisible: false,
  visualReviewPanelOtherVisible: false,
  visualReviewPanelFlagVisible: false,
};

const MASKER_CONFIG = {
  layout: "Masker",

  leftPanelVisible: true,
  leftPanelOpen: true,

  toolsPanelVisible: true,

  functionToolGroupVisible: true,

  formToolGroupVisible: true,

  leftClickToolGroupVisible: true,
  leftClickToolGroupValue: "selection",
  leftClickToolWindowLevelVisible: true,
  leftClickToolRectangleScissorsVisible: true,

  rightClickToolGroupVisible: true,
  rightClickToolGroupValue: "zoom",
  rightClickToolZoomVisible: true,
  rightClickToolPanVisible: true,

  resetViewportsVisible: true,

  maskerPanelVisible: true,
  maskerPanelExpandSelectionVisible: true,
  maskerPanelClearSelectionVisible: true,
  maskerPanelAcceptSelectionVisible: true,
};

const MASKER_REVIEW_CONFIG = {
  layout: "MaskerReview",

  leftPanelVisible: true,
  leftPanelOpen: true,

  toolsPanelVisible: true,

  leftClickToolGroupVisible: true,
  leftClickToolGroupValue: "windowlevel",
  leftClickToolWindowLevelVisible: true,

  rightClickToolGroupVisible: true,
  rightClickToolGroupValue: "zoom",
  rightClickToolZoomVisible: true,
  rightClickToolPanVisible: true,

  resetViewportsVisible: true,

  maskerReviewPanelVisible: true,
  maskerReviewPanelAcceptedVisible: true,
  maskerReviewPanelRejectedVisible: true,
  maskerReviewPanelSkipVisible: true,
  maskerReviewPanelNonMaskableVisible: true,
};

const VISUAL_REVIEW_CONFIG = {
  layout: "VisualReview",

  leftPanelVisible: true,
  leftPanelOpen: true,

  toolsPanelVisible: true,

  leftClickToolGroupVisible: true,
  leftClickToolGroupValue: "windowlevel",
  leftClickToolWindowLevelVisible: true,

  rightClickToolGroupVisible: true,
  rightClickToolGroupValue: "zoom",
  rightClickToolZoomVisible: true,
  rightClickToolPanVisible: true,

  resetViewportsVisible: true,

  rightPanelVisible: true,
  rightPanelOpen: true,

  descriptionPanelVisible: true,

  visualReviewPanelVisible: true,
  visualReviewPanelGoodVisible: true,
  visualReviewPanelBadVisible: true,
  visualReviewPanelBlankVisible: true,
  visualReviewPanelScoutVisible: true,
  visualReviewPanelOtherVisible: true,
};

const STACK_CONFIG = {
  viewport_layout: "stack",

  viewToolGroupVisible: true,
  viewToolGroupValue: "stack",
  viewToolStackVisible: true,

  functionToolGroupValue: "blackout",
  functionToolBlackoutVisible: true,

  formToolGroupValue: "cuboid",
  formToolCuboidVisible: true,
};

const VOLUME_CONFIG = {
  viewport_layout: "volume",

  viewToolGroupVisible: true,
  viewToolGroupValue: "volume",
  viewToolVolumeVisible: true,
  viewToolProjectionVisible: true,
  viewToolStackVisible: false,

  functionToolGroupValue: "mask",
  functionToolMaskVisible: true,
  functionToolBlackoutVisible: true,
  functionToolSliceRemoveVisible: true,

  formToolGroupValue: "cylinder",
  formToolCuboidVisible: true,
  formToolCylinderVisible: true,

  leftClickToolCrossHairsVisible: true,

  opacityToolVisible: true,
  presetToolVisible: true,

  visualReviewPanelFlagVisible: true,
};

// Extend base configuration with route-specific overrides
export const TASK_CONFIGS = {
  default: { ...BASE_DEFAULTS },

  masker_stack: {
    ...BASE_DEFAULTS,
    ...MASKER_CONFIG,
    ...STACK_CONFIG,

    title: "Image Masker",

    maskerPanelExpandSelectionVisible: false,
  },

  masker_volume: {
    ...BASE_DEFAULTS,
    ...MASKER_CONFIG,
    ...VOLUME_CONFIG,

    title: "Volume Masker",

    viewToolStackVisible: false,
  },

  masker_review_stack: {
    ...BASE_DEFAULTS,
    ...MASKER_REVIEW_CONFIG,
    ...STACK_CONFIG,

    title: "Image Masker Review",
  },

  masker_review_volume: {
    ...BASE_DEFAULTS,
    ...MASKER_REVIEW_CONFIG,
    ...VOLUME_CONFIG,

    title: "Volume Masker Review",
  },

  nifti_review: {
    ...BASE_DEFAULTS,
    ...VISUAL_REVIEW_CONFIG,
    ...VOLUME_CONFIG,

    title: "NIfTI Review",
    nifti: true,

    presetToolValue: "MR-Default",

    visualReviewPanelFlagVisible: false,
  },

  dicom_review_stack: {
    ...BASE_DEFAULTS,
    ...VISUAL_REVIEW_CONFIG,
    ...STACK_CONFIG,

    title: "DICOM Image Review",
    //topPanelVisible: true,
    //bottomPanelVisible: true,
  },

  dicom_review_volume: {
    ...BASE_DEFAULTS,
    ...VISUAL_REVIEW_CONFIG,
    ...VOLUME_CONFIG,

    title: "DICOM Volume Review",
  },
};
