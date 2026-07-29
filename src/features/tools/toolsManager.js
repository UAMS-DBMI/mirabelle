import React, { useState, useEffect, useRef } from "react";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { useSelector, useDispatch } from "react-redux";
import { setFunction, setForm } from "@/features/maskingSlice";
import { Enums } from "@/features/presentationSlice";
import { setOption } from "@/features/optionSlice";
import { ClampedRectangleScissorsTool } from "@/lib/clampedRectangleScissors";

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

/**
 * Whether Cornerstone still knows about this tool group.
 *
 * IEC navigation destroys the tool groups and creates replacements, and React
 * runs every cleanup — including the one doing the destroying — before any
 * mount effect. This panel remounts per exam (keyed on the IEC), so its setup
 * effect runs inside that gap, still holding the group of the exam we just
 * left. Acting on a destroyed group is at best a no-op, and for tools that
 * resolve their group by id in the mode callbacks (Crosshairs) it throws
 * outright. Skip instead: the effect re-runs once the live group arrives.
 */
function isLiveToolGroup(toolGroup) {
  return (
    !!toolGroup && ToolGroupManager.getToolGroup(toolGroup.id) === toolGroup
  );
}

export default function useToolsManager({
  toolGroup,
  toolGroup3d,
  defaultLeftClickMode,
  defaultRightClickMode,
}) {
  const _maskingOperation = useSelector((state) => state.masking.operation);
  const dispatch = useDispatch();

  if (!toolsLoaded) {
    // add tools globally to cornerstone, but only once ever
    cornerstoneTools.addTool(ClampedRectangleScissorsTool);
    cornerstoneTools.addTool(StackScrollTool);
    cornerstoneTools.addTool(WindowLevelTool);
    cornerstoneTools.addTool(CrosshairsTool);
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(ZoomTool);
    toolsLoaded = true;
  }

  // Disable whatever tool is currently bound to the left-click, leaving nothing
  // active on the primary button. Used to keep the left-click inert while an
  // image loads instead of falling back to the window-level tool.
  const disableLeftClick = () => {
    if (!isLiveToolGroup(toolGroup)) return;
    getActiveTools(toolGroup, MouseBindings.Primary).forEach((tool) => {
      toolGroup.setToolDisabled(tool);
    });
  };

  const switchLeftClickMode = (new_mode) => {
    if (!isLiveToolGroup(toolGroup)) return;
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
        newTool = ClampedRectangleScissorsTool;
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
    if (!isLiveToolGroup(toolGroup)) return;
    getActiveTools(toolGroup, MouseBindings.Secondary).forEach((tool) => {
      toolGroup.setToolDisabled(tool);
    });
    if (isLiveToolGroup(toolGroup3d)) {
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
    if (isLiveToolGroup(toolGroup3d)) {
      toolGroup3d.setToolActive(newTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
      });
    }
  };

  useEffect(() => {
    // The group we were handed may already have been destroyed by IEC
    // navigation (see isLiveToolGroup) — setting up tools on it would throw and
    // the work would be thrown away anyway. This effect re-runs with the
    // replacement group as soon as the route hands it down.
    if (!isLiveToolGroup(toolGroup)) return;

    // add tools and setup default toolGroup actions
    toolGroup.addTool(ClampedRectangleScissorsTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(WindowLevelTool.toolName);
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

    if (isLiveToolGroup(toolGroup3d)) {
      toolGroup3d.addTool(ZoomTool.toolName);
      toolGroup3d.addTool(PanTool.toolName);
    }

    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
    });
    if (isLiveToolGroup(toolGroup3d)) {
      toolGroup3d.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
      });
    }

    // The selection (scissors) tool needs an active segmentation, which only
    // exists once the image has finished loading. Rather than falling back to
    // the window-level tool while loading — which stole the left-click from the
    // selection on every load — keep the left-click disabled here and let it be
    // enabled to the selection tool once the image is ready (see the
    // AllowSegmentationDrawing listener in ToolsPanel). Other routes (review)
    // keep activating their configured default.
    if (defaultLeftClickMode === Enums.LeftClickOptions.SELECTION) {
      disableLeftClick();
    } else {
      switchLeftClickMode(defaultLeftClickMode);
    }
    switchRightClickMode(defaultRightClickMode);
  }, [toolGroup]);

  return {
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
