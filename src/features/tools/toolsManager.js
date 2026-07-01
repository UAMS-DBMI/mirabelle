import React, { useState, useEffect, useRef } from "react";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { useSelector, useDispatch } from "react-redux";
import { setFunction, setForm } from "@/features/maskingSlice";
import { Enums } from "@/features/presentationSlice";
import { setOption } from "@/features/optionSlice";
import { ClampedRectangleScissorsTool } from "@/lib/clampedRectangleScissors";
import {
  USE_RECTANGLE_ROI_FOR_STACK,
  STACK_ROI_TOOL_CONFIG,
} from "@/lib/maskRectangleRoi";
import { USE_RECTANGLE_ROI_FOR_VOLUME } from "@/lib/maskRectangleRoiVolume";
import {
  MaskRectangleRoiTool,
  MASK_ROI_TOOL_CONFIG,
} from "@/lib/maskRectangleRoiTool";

// Use this global to track when the tools have been added globally
let toolsLoaded = false;

const {
  ToolGroupManager,
  TrackballRotateTool,
  BrushTool,
  StackScrollTool,
  WindowLevelTool,
  CrosshairsTool,
  PanTool,
  ZoomTool,
  RectangleROITool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

/**
 * Get the active tools for a given tool group and mouse button
 * @param {object} toolGroup - The tool group to check
 * @param {number} mouseButton - The mouse button to check (1 for left, 2 for right)
 * @return {array} - An array of active tool names for the given mouse button
 */
function getActiveTools(toolGroup, mouseButton) {
  let bindings = Object.keys(toolGroup.toolOptions)
    .map((key) => [
      key,
      toolGroup.toolOptions[key].bindings
        .map((binding) => binding.mouseButton)
        .filter((binding) => binding === mouseButton),
    ])
    .filter(([key, binding]) => binding.length > 0)
    .map(([key]) => key);

  return bindings;
}

export default function useToolsManager({
  toolGroup,
  toolGroup3d,
  defaultLeftClickMode,
  defaultRightClickMode,
  // True in volume mode, false in stack mode, undefined on other routes. Used to
  // pick the stack-mode selection tool (RectangleROITool) — see the prototype in
  // maskRectangleRoi.js. The strict `=== false` check below keeps every other
  // route on the scissors tool.
  volumetric,
}) {
  const _maskingOperation = useSelector((state) => state.masking.operation);
  const dispatch = useDispatch();

  // The mask selection tool is a native, resizable RectangleROI instead of the
  // scissors that paint a labelmap — in stack mode (rectangle + frame range) and,
  // when enabled, in volume mode (a rectangle per ortho pane reconciled into one
  // 3D box, see maskRectangleRoiVolume.js).
  const useRoi =
    (volumetric === false && USE_RECTANGLE_ROI_FOR_STACK) ||
    (volumetric === true && USE_RECTANGLE_ROI_FOR_VOLUME);

  // Volume mode uses the filled, move-anywhere MaskRectangleRoiTool; stack mode
  // uses the stock RectangleROITool (its frame-range feature keys off that tool).
  const roiTool = volumetric === true ? MaskRectangleRoiTool : RectangleROITool;
  const roiToolConfig =
    volumetric === true ? MASK_ROI_TOOL_CONFIG : STACK_ROI_TOOL_CONFIG;

  if (!toolsLoaded) {
    // add tools globally to cornerstone, but only once ever
    cornerstoneTools.addTool(ClampedRectangleScissorsTool);
    cornerstoneTools.addTool(StackScrollTool);
    cornerstoneTools.addTool(WindowLevelTool);
    cornerstoneTools.addTool(CrosshairsTool);
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    cornerstoneTools.addTool(RectangleROITool);
    cornerstoneTools.addTool(MaskRectangleRoiTool);
    toolsLoaded = true;
  }

  // Disable whatever tool is currently bound to the left-click, leaving nothing
  // active on the primary button. Used to keep the left-click inert while an
  // image loads instead of falling back to the window-level tool.
  const disableLeftClick = () => {
    getActiveTools(toolGroup, MouseBindings.Primary).forEach((tool) => {
      toolGroup.setToolDisabled(tool);
    });
  };

  const switchLeftClickMode = (new_mode) => {
    getActiveTools(toolGroup, MouseBindings.Primary).forEach((tool) => {
      toolGroup.setToolDisabled(tool);
    });
    let newTool;

    switch (new_mode) {
      case Enums.LeftClickOptions.WINDOW_LEVEL:
        newTool = WindowLevelTool;
        break;

      case Enums.LeftClickOptions.CROSSHAIRS:
        newTool = CrosshairsTool;
        break;

      case Enums.LeftClickOptions.SELECTION:
        newTool = useRoi ? roiTool : ClampedRectangleScissorsTool;
        break;
    }

    if (newTool === undefined) {
      // nothing to do, not sure what is going on
      console.error("Left Click mode was invalid: ", new_mode);
      return;
    }

    // Record the active left-click tool so consumers can react to it — e.g. the
    // mask selection box only exposes its move/resize controls while the
    // selection tool is active, staying frozen and click-through under window
    // level / crosshairs.
    dispatch(setOption({ key: "leftClick", value: new_mode }));

    toolGroup.setToolActive(newTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
  };

  const switchRightClickMode = (new_mode) => {
    getActiveTools(toolGroup, MouseBindings.Secondary).forEach((tool) => {
      toolGroup.setToolDisabled(tool);
    });
    if (toolGroup3d) {
      getActiveTools(toolGroup3d, MouseBindings.Secondary).forEach((tool) => {
        toolGroup3d.setToolDisabled(tool);
      });
    }

    let newTool;

    switch (new_mode) {
      case Enums.RightClickOptions.PAN:
        newTool = PanTool;
        break;

      case Enums.RightClickOptions.ZOOM:
        newTool = ZoomTool;
        break;
    }

    toolGroup.setToolActive(newTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
    });
    if (toolGroup3d) {
      toolGroup3d.setToolActive(newTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
      });
    }
  };

  useEffect(() => {
    // add tools and setup default toolGroup actions
    toolGroup.addTool(ClampedRectangleScissorsTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(WindowLevelTool.toolName);
    if (useRoi) {
      toolGroup.addTool(roiTool.toolName, roiToolConfig);
    }
    console.log(console.log(toolGroup));

    function getReferenceLineColor(viewportId) {
      return {
        axial2d: "rgb(200, 0, 0)",
        sagittal2d: "rgb(200,200,0)",
        coronal2d: "rgb(0,200,0)",
      }[viewportId];
    }

    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
    });

    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);

    if (toolGroup3d) {
      toolGroup3d.addTool(ZoomTool.toolName);
      toolGroup3d.addTool(PanTool.toolName);
    }

    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
    });
    if (toolGroup3d) {
      toolGroup3d.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
      });
    }

    // The scissors selection tool needs an active segmentation, which only
    // exists once the image has finished loading. Rather than falling back to
    // the window-level tool while loading — which stole the left-click from the
    // selection on every load — keep the left-click disabled here and let it be
    // enabled to the selection tool once the image is ready (see the
    // AllowSegmentationDrawing listener in ToolsPanel). Other routes (review)
    // keep activating their configured default.
    //
    // The RectangleROITool (useRoi) doesn't need a segmentation, so there's
    // nothing to wait for — activate it immediately so it can draw even while
    // the image is still loading.
    if (defaultLeftClickMode === Enums.LeftClickOptions.SELECTION && !useRoi) {
      disableLeftClick();
    } else {
      switchLeftClickMode(defaultLeftClickMode);
    }
    switchRightClickMode(defaultRightClickMode);
  }, [toolGroup]);

  return {
    // Exposed so ToolsPanel can leave the selection button enabled from the
    // start when the ROI tool (which needs no segmentation) is in use.
    useRoi,
    switchRightClickMode,
    switchLeftClickMode,
    switchFunctionMode: (mode) => {
      dispatch(
        setOption({
          key: "function",
          value: mode,
        }),
      );
      dispatch(setFunction(mode));
    },
    switchFormMode: (mode) => {
      dispatch(
        setOption({
          key: "form",
          value: mode,
        }),
      );
      dispatch(setForm(mode));
    },
  };
}
