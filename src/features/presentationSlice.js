import { createSlice } from '@reduxjs/toolkit';
import * as cornerstone from '@cornerstonejs/core';

export const Enums = {
  ViewOptions: Object.freeze({
    VOLUME: 'volume',
    PROJECTION: 'projection',
    STACK: 'stack',
  }),
  FunctionOptions: Object.freeze({
    MASK: 'mask',
    BLACKOUT: 'blackout',
    SLICE_REMOVE: 'slice_remove',
  }),
  FormOptions: Object.freeze({
    CUBOID: 'cuboid',
    CYLINDER: 'cylinder',
  }),
  LeftClickOptions: Object.freeze({
    SELECTION: 'selection',
    WINDOW_LEVEL: 'window_level',
    CROSSHAIRS: 'crosshairs',
  }),
  RightClickOptions: Object.freeze({
    ZOOM: 'zoom',
    PAN: 'pan',
  }),
}

const presentationSlice = createSlice({
  name: 'presentation',
  initialState: {
    // Panel Configuration
    panelConfig: {
      visibility: {
        left: false,
        right: false,
        top: false,
        bottom: false,
        tools: false,
        files: false,
        description: false,
        navigation: false,
        search: false,
      },
      open: {
        left: false,
        right: false,
      },
    },
    // Tools Configuration
    toolsConfig: {
      viewToolGroup: {
        visible: false,
        defaultValue: 'volume',
        visibility: {
          volume: false,
          projection: false,
          stack: false,
        },
      },
      functionToolGroup: {
        visible: false,
        defaultValue: 'mask',
        visibility: {
          mask: false,
          blackout: false,
          sliceRemove: false,
        },
      },
      formToolGroup: {
        visible: false,
        defaultValue: 'cylinder',
        visibility: {
          cuboid: false,
          cylinder: false,
        },
      },
      leftClickToolGroup: {
        visible: false,
        defaultValue: 'selection',
        visibility: {
          windowLevel: false,
          rectangleScissors: false,
          crossHairs: false,
        }
      },
      rightClickToolGroup: {
        visible: false,
        defaultValue: 'zoom',
        visibility: {
          zoom: false,
          pan: false,
        }
      },
      opacityToolGroup: {
        visible: false,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.3,
      },
      presetToolGroup: {
        visible: false,
        defaultValue: 'CT-MIP',
      },
      resetToolGroup: {
        visible: false,
        defaultValue: false,
      },
    },
    // Button Panel Configuration
    buttonConfig: {
      masker: {
        visible: false,
        visibility: {
          expand: false,
          clear: false,
          accept: false,
          skip: false,
          nonMaskable: false,
        },
      },
      maskerReview: {
        visible: false,
        visibility: {
          accepted: false,
          rejected: false,
        },
      },
      visualReview: {
        visible: false,
        visibility: {
          good: false,
          bad: false,
          blank: false,
          scout: false,
          other: false,
          flag: false,
        },
      },
    },

    maximumIntensityProjection: false,

    presets: cornerstone.CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
  },
  reducers: {
    reset: (state, action) => {
      const initial = presentationSlice.getInitialState();
      return {
        ...initial,
      }
    },

    // Set the entire toolsConfig
    setToolsConfig: (state, action) => {
      state.toolsConfig = { ...state.toolsConfig, ...action.payload }
    },
    setPresets: (state, action) => {
      state.presets = action.payload
    },
    addPreset: (state, action) => {
      if (!state.presets.includes(action.payload)) {
        state.presets.push(action.payload)
      }
    },
    removePreset: (state, action) => {
      state.presets = state.presets.filter(preset => preset !== action.payload)
    },

    // toggle just the left/right booleans
    toggleLeftPanel(state) {
      state.panelConfig.open.left = !state.panelConfig.open.left;
    },
    toggleRightPanel(state) {
      state.panelConfig.open.right = !state.panelConfig.open.right;
    },

    // Sets the configuration for the Masker Route
    setMaskerConfig: (state, action) => {

      // const oldstate = { ...state };
      // // Reset to initialState manually
      // Object.assign(state,
      //   JSON.parse(JSON.stringify(presentationSlice.getInitialState())));

      state.panelConfig.visibility.tools = true;
      state.panelConfig.visibility.reset = true;

      // Set visibility for left and right panels
      state.panelConfig.visibility.left = true;
      state.panelConfig.visibility.right = true;

      // Set open state for left and right panels
      state.panelConfig.open.left = true;
      state.panelConfig.open.right = true;

      state.toolsConfig.functionToolGroup.visible = true;
      state.toolsConfig.formToolGroup.visible = true;

      state.toolsConfig.leftClickToolGroup.visible = true;
      state.toolsConfig.leftClickToolGroup.defaultValue = Enums.LeftClickOptions.SELECTION;
      state.toolsConfig.leftClickToolGroup.visibility.windowLevel = true;
      state.toolsConfig.leftClickToolGroup.visibility.rectangleScissors = true;

      state.toolsConfig.rightClickToolGroup.visible = true;
      state.toolsConfig.rightClickToolGroup.defaultValue = Enums.RightClickOptions.ZOOM;
      state.toolsConfig.rightClickToolGroup.visibility.zoom = true;
      state.toolsConfig.rightClickToolGroup.visibility.pan = true;

      state.buttonConfig.masker.visible = true;
      state.buttonConfig.masker.visibility.expand = true;
      state.buttonConfig.masker.visibility.clear = true;
      state.buttonConfig.masker.visibility.accept = true;
      state.buttonConfig.maskerReview.visibility.skip = true;
      state.buttonConfig.maskerReview.visibility.nonMaskable = true;

      return state;
    },

    // Sets the configuration for the Masker Review Route
    setMaskerReviewConfig: (state, action) => {
      state.panelConfig.visibility.tools = true;
      state.panelConfig.visibility.reset = true;

      // Set visibility for left and right panels
      state.panelConfig.visibility.left = true;
      state.panelConfig.visibility.right = true;

      // Set open state for left and right panels
      state.panelConfig.open.left = true;
      state.panelConfig.open.right = true;

      state.toolsConfig.leftClickToolGroup.visible = true;
      state.toolsConfig.leftClickToolGroup.defaultValue = Enums.LeftClickOptions.WINDOW_LEVEL;
      state.toolsConfig.leftClickToolGroup.visibility.windowLevel = true;

      state.toolsConfig.rightClickToolGroup.visible = true;
      state.toolsConfig.rightClickToolGroup.defaultValue = Enums.RightClickOptions.ZOOM;
      state.toolsConfig.rightClickToolGroup.visibility.zoom = true;
      state.toolsConfig.rightClickToolGroup.visibility.pan = true;

      state.buttonConfig.maskerReview.visible = true;
      state.buttonConfig.maskerReview.visibility.accepted = true;
      state.buttonConfig.maskerReview.visibility.rejected = true;
      state.buttonConfig.maskerReview.visibility.skip = true;
      state.buttonConfig.maskerReview.visibility.nonMaskable = true;

      return state;
    },

    // Sets the configuration for the Visual Review Route
    setVisualReviewConfig: (state, action) => {
      state.panelConfig.visibility.tools = true;
      state.panelConfig.visibility.reset = true;
      state.panelConfig.visibility.description = true;

      // Set visibility for left and right panels
      state.panelConfig.visibility.left = true;
      state.panelConfig.visibility.right = true;

      // Set open state for left and right panels
      state.panelConfig.open.left = true;
      state.panelConfig.open.right = true;

      state.toolsConfig.leftClickToolGroup.visible = true;
      state.toolsConfig.leftClickToolGroup.defaultValue = Enums.LeftClickOptions.WINDOW_LEVEL;
      state.toolsConfig.leftClickToolGroup.visibility.windowLevel = true;

      state.toolsConfig.rightClickToolGroup.visible = true;
      state.toolsConfig.rightClickToolGroup.defaultValue = Enums.RightClickOptions.ZOOM;
      state.toolsConfig.rightClickToolGroup.visibility.zoom = true;
      state.toolsConfig.rightClickToolGroup.visibility.pan = true;

      state.buttonConfig.visualReview.visible = true;
      state.buttonConfig.visualReview.visibility.good = true;
      state.buttonConfig.visualReview.visibility.bad = true;
      state.buttonConfig.visualReview.visibility.blank = true;
      state.buttonConfig.visualReview.visibility.scout = true;
      state.buttonConfig.visualReview.visibility.other = true;
      state.buttonConfig.visualReview.visibility.flag = true;

      return state;
    },

    // Sets the configuration for Stacks
    setStackConfig: (state, action) => {
      state.toolsConfig.viewToolGroup.visible = true;
      state.toolsConfig.viewToolGroup.defaultValue = Enums.ViewOptions.STACK;
      state.toolsConfig.viewToolGroup.visibility.stack = true;

      state.toolsConfig.functionToolGroup.defaultValue = Enums.FunctionOptions.BLACKOUT;
      state.toolsConfig.functionToolGroup.visibility.blackout = true;

      state.toolsConfig.formToolGroup.defaultValue = Enums.FormOptions.CUBOID;
      state.toolsConfig.formToolGroup.visibility.cuboid = true;

      state.toolsConfig.opacityToolGroup.visible = false;
      state.toolsConfig.presetToolGroup.visible = false;

      state.buttonConfig.masker.visibility.expand = false;

      return state;
    },

    // Sets the configuration for Stacks
    setVolumeConfig: (state, action) => {
      state.toolsConfig.viewToolGroup.visible = true;
      state.toolsConfig.viewToolGroup.defaultValue = Enums.ViewOptions.VOLUME;
      state.toolsConfig.viewToolGroup.visibility.volume = true;
      state.toolsConfig.viewToolGroup.visibility.projection = true;
      state.toolsConfig.viewToolGroup.visibility.stack = false;

      state.toolsConfig.functionToolGroup.defaultValue = Enums.FunctionOptions.MASK;
      state.toolsConfig.functionToolGroup.visibility.mask = true;
      state.toolsConfig.functionToolGroup.visibility.blackout = true;
      state.toolsConfig.functionToolGroup.visibility.sliceRemove = true;

      state.toolsConfig.formToolGroup.defaultValue = Enums.FormOptions.CYLINDER;
      state.toolsConfig.formToolGroup.visibility.cuboid = true;
      state.toolsConfig.formToolGroup.visibility.cylinder = true;

      state.toolsConfig.leftClickToolGroup.visibility.crossHairs = true;

      state.toolsConfig.opacityToolGroup.visible = true;
      state.toolsConfig.presetToolGroup.visible = true;

      return state;
    },

    // Sets the configuration for Stacks
    setNiftiConfig: (state, action) => {
      state.buttonConfig.visualReview.visibility.flag = false;
      state.toolsConfig.viewToolGroup.visibility.stack = false;

      // Set visibility for left and right panels
      state.panelConfig.visibility.left = true;
      state.panelConfig.visibility.right = true;

      // Set open state for left and right panels
      state.panelConfig.open.left = true;
      state.panelConfig.open.right = true;

      return state;
    },


  }
})

export const { 
  setPresets,
  addPreset,
  removePreset,
  setToolsConfig,
  reset,
  toggleLeftPanel,
  toggleRightPanel,
  setMaskerConfig,
  setMaskerReviewConfig,
  setVisualReviewConfig,
  setStackConfig,
  setVolumeConfig,
  setNiftiConfig,
} = presentationSlice.actions

export default presentationSlice.reducer 
