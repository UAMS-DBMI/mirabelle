import React, { useState, useContext, useEffect } from "react";
import { Context } from "./Context.js";
import { getNextIECForVRReview, getNextIECForVR } from "../utilities";

import NavigationPanel from "./NavigationPanel";

function ToolsPanel({ iec, details }) {
  const context = useContext(Context);
  const layout = context.layout;

  /*
   * Handle shortcut key(s)
   */
  useEffect(() => {
    const handleKeyDown = async (event) => {
      if (event.keyCode == 9) {
        event.preventDefault();
        await handleOnNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleOpacityChange = (event) => {
    const newOpacity = parseFloat(event.target.value);
    context.setOpacityToolValue(newOpacity);
  };

  const handlePresetChange = (event) => {
    const newPreset = event.target.value;
    context.setPresetToolValue(newPreset);
  };

  const handleNoiseChange = e => {
    const newNoise = parseInt(e.target.value);
    context.setNoiseToolValue(newNoise);
  };

  const handleFillChange = e => {
    const newFill = parseInt(e.target.value);
    context.setFillToolValue(newFill);
  };

  async function handleOnNext() {
    const vr = details.visual_review_instance_id;

    let iec;
    let newURL;
    if (layout === "MaskerReview") {
      iec = await getNextIECForVRReview(vr);
      newURL = `/mira/review/mask/iec/${iec}`;
    } else {
      iec = await getNextIECForVR(vr);
      newURL = `/mira/mask/iec/${iec}`;
    }

    if (iec === undefined) {
      alert("This VR has no more IECs waiting! You cannot go forward.");
    } else {
      // TODO this is very bad and only here for emergency
      window.location.href = newURL;
    }
  }
  function handleOnPrevious() {
    alert("Not yet implemented :(");
  }

  return (
    <div
      id="toolsPanel"
      className="overflow-y-auto no-scrollbars p-6 rounded-lg bg-blue-100 dark:bg-blue-900"
    >
      {/*<div className="mb-2 font-semib  old">Tools</div>*/}
      <ul className=" h-full pb-4">
        {/*Navigation Panel*/}
        {context.navigationPanelVisible && (
          <NavigationPanel
            onNext={handleOnNext}
            onPrevious={handleOnPrevious}
            iec={iec}
          />
        )}

        {/*View Group*/}
        {context.viewToolGroupVisible && (
          <>
            View:
            <li className="pt-1 pb-4 dark:bg-opacity-5 rounded-lg flex space-x-2">
              {context.viewToolVolumeVisible && (
                <button
                  title="Volume"
                  onClick={() => context.setViewToolGroupValue("volume")}
                  className={`w-full ${context.viewToolGroupValue === "volume" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">
                    deployed_code
                  </span>
                </button>
              )}
              {context.viewToolProjectionVisible && (
                <button
                  title="Maximum Intensity Projection"
                  onClick={() => context.setViewToolGroupValue("projection")}
                  className={`w-full ${context.viewToolGroupValue === "projection" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">light_mode</span>
                </button>
              )}
              {context.viewToolStackVisible && (
                <button
                  title="Stack"
                  onClick={() => context.setViewToolGroupValue("stack")}
                  className={`w-full ${context.viewToolGroupValue === "stack" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">stacks</span>
                </button>
              )}
            </li>
          </>
        )}

        {/*Function Group*/}
        {context.functionToolGroupVisible && (
          <>
            Function:
            <li className="pt-1 pb-4 dark:bg-opacity-5 rounded-lg flex space-x-2">
              {context.functionToolMaskVisible && (
                <button
                  title="Mask"
                  onClick={() => context.setFunctionToolGroupValue("mask")}
                  className={`w-full ${context.functionToolGroupValue === "mask" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">domino_mask</span>
                </button>
              )}
              {context.functionToolBlackoutVisible && (
                <button
                  title="Blackout"
                  onClick={() => context.setFunctionToolGroupValue("blackout")}
                  className={`w-full ${context.functionToolGroupValue === "blackout" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">
                    imagesearch_roller
                  </span>
                </button>
              )}
              {context.functionToolSliceRemoveVisible && (
                <button
                  title="Slice Removal"
                  onClick={() =>
                    context.setFunctionToolGroupValue("sliceremove")
                  }
                  className={`w-full ${context.functionToolGroupValue === "sliceremove" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">content_cut</span>
                </button>
              )}
            </li>
          </>
        )}

        {/*Form Group*/}
        {context.formToolGroupVisible && (
          <>
            Form:
            <li className="pt-1 pb-4 dark:bg-opacity-5 rounded-lg flex space-x-2">
              {context.formToolCuboidVisible && (
                <button
                  title="Cuboid"
                  onClick={() => context.setFormToolGroupValue("cuboid")}
                  className={`w-full ${context.formToolGroupValue === "cuboid" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">square</span>
                </button>
              )}
              {context.formToolCylinderVisible && (
                <button
                  title="Cylinder"
                  onClick={() => context.setFormToolGroupValue("cylinder")}
                  className={`w-full ${context.formToolGroupValue === "cylinder" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">circle</span>
                </button>
              )}
            </li>
          </>
        )}


        {/*Filters*/}
        {context.filterToolGroupVisible && (
          <div className="flex gap-2 pb-4">
            <li className="flex flex-wrap flex-1 min-w-0">
              Noise: {context.noiseToolValue}
              <input className="w-full"
                type="range"
                min={0}
                max={10}
                step={1}
                value={context.noiseToolValue}
                onChange={handleNoiseChange}
              />
            </li>
            <li className="flex flex-wrap flex-1 min-w-0">
              Fill: {context.fillToolValue}
              <input className="w-full"
                type="range"
                min={0}
                max={10}
                step={1}
                value={context.fillToolValue}
                onChange={handleFillChange}
              />
            </li>
          </div>
        )}

        {/*Left-Click Group*/}
        {context.leftClickToolGroupVisible && (
          <>
            Left-Click:
            <li className="pt-1 pb-4 dark:bg-opacity-5 rounded-lg flex space-x-2">
              {context.leftClickToolWindowLevelVisible && (
                <button
                  title="Window Level"
                  onClick={() =>
                    context.setLeftClickToolGroupValue("windowlevel")
                  }
                  className={`w-full ${context.leftClickToolGroupValue === "windowlevel" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">exposure</span>
                </button>
              )}
              {context.leftClickToolCrossHairsVisible && (
                <button
                  title="Crosshairs"
                  onClick={() =>
                    context.setLeftClickToolGroupValue("crosshairs")
                  }
                  className={`w-full ${context.leftClickToolGroupValue === "crosshairs" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">point_scan</span>
                </button>
              )}
              {context.leftClickToolRectangleScissorsVisible && (
                <button
                  title="Selection"
                  onClick={() =>
                    context.setLeftClickToolGroupValue("selection")
                  }
                  className={`w-full ${context.leftClickToolGroupValue === "selection" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                >
                  <span className="material-symbols-rounded">
                    gesture_select
                  </span>
                </button>
              )}
            </li>
          </>
        )}

        {/*Right-Click Group*/}
        {context.rightClickToolGroupVisible && (
          <>
            Right-Click:
            <li className="pt-1 pb-4 dark:bg-opacity-5 rounded-lg flex space-x-2">
              {context.rightClickToolZoomVisible && (
                <button
                  onClick={() => context.setRightClickToolGroupValue("zoom")}
                  className={`w-full ${context.rightClickToolGroupValue === "zoom" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                  title="Zoom"
                >
                  <span className="material-symbols-rounded">search</span>
                </button>
              )}
              {context.rightClickToolPanVisible && (
                <button
                  onClick={() => context.setRightClickToolGroupValue("pan")}
                  className={`w-full ${context.rightClickToolGroupValue === "pan" ? "text-white bg-blue-500" : "bg-white dark:bg-slate-900"}`}
                  title="Pan"
                >
                  <span className="material-symbols-rounded">pan_tool</span>
                </button>
              )}
            </li>
          </>
        )}

        {/*Opacity*/}
        {context.opacityToolVisible && (
          <li className="pt-2 dark:bg-opacity-5 rounded-lg">
            Opacity: {context.opacityToolValue}
            <input
              className="w-full cursor-pointer"
              type="range"
              min={context.opacityToolMin}
              max={context.opacityToolMax}
              step={context.opacityToolStep}
              value={context.opacityToolValue}
              onChange={handleOpacityChange}
            />
          </li>
        )}

        {/*Preset*/}
        {context.presetToolVisible && (
          <li className="pb-2 pt-2 rounded-lg">
            Preset:
            <select
              name="preset"
              value={context.presetToolValue}
              onChange={handlePresetChange}
              className="w-full cursor-pointer text-black dark:text-white border border-gray-300 dark:bg-slate-800 rounded-lg p-2 mt-1"
            >
              {context.presetToolList.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </li>
        )}

        {/*Reset Viewports*/}
        {context.resetViewportsVisible && (
          <li className="mb-2 pb-2 pt-4 rounded-lg">
            <button
              onClick={() => context.setResetViewportsValue(true)}
              className="w-full text-white bg-red-600"
              title="Reset Viewports"
            >
              <span className="material-symbols-rounded">refresh</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

export default ToolsPanel;
