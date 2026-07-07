import React, { useState, useContext, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setOption } from "@/features/optionSlice";
import { Enums } from "@/features/presentationSlice";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import MaterialButtonSet from "@/components/MaterialButtonSet";

import { resetViewportsView } from "@/lib/viewportView";

import useToolsManager from "./toolsManager";
import useToolsConfigs from "./toolsConfig";

import "./ToolsPanel.css";

function toTitleCase(some_string) {
  return some_string.replace("_", " ").replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export default function ToolsPanel({
  toolGroup,
  toolGroup3d,
  onPresetChange,
  preset3d,
  renderingEngine,
  onApplyDecimate,
}) {
  const dispatch = useDispatch();

  const presets = useSelector((state) => state.presentation.presets);
  const globalToolsConfig = useSelector(
    (state) => state.presentation.toolsConfig,
  );
  const globalStateValues = useSelector((state) => state.options);
  const [appliedDecimate, setAppliedDecimate] = useState(
    globalStateValues.decimate,
  );

  // pull filters config + values from Redux
  // const { filterToolGroup } = globalToolsConfig;
  const noise = globalStateValues.noise;
  const fill = globalStateValues.fill;

  const handleNoiseChange = (e) => {
    const value = parseInt(e.target.value);
    dispatch(setOption({ key: "noise", value }));
  };

  const handleFillChange = (e) => {
    const value = parseInt(e.target.value);
    dispatch(setOption({ key: "fill", value }));
  };

  // pull opacity config + value from Redux
  const { opacityToolGroup } = globalToolsConfig;
  const opacity = globalStateValues.opacity;

  const handleOpacityChange = (e) => {
    const value = parseFloat(e.target.value);
    dispatch(setOption({ key: "opacity", value }));
  };

  // pull decimate config + value from Redux
  const { decimateToolGroup } = globalToolsConfig;
  const decimate = globalStateValues.decimate;
  const persistent = globalStateValues.persistent;

  const handleDecimateChange = (e) => {
    console.log("Decimate input changed:", e.target.value);
    const value = parseInt(e.target.value) || 0;
    setAppliedDecimate(value);
  };

  const handleDecimateApply = () => {
    dispatch(setOption({ key: "decimate", value: appliedDecimate }));
    if (onApplyDecimate) {
      onApplyDecimate(appliedDecimate);
    }
  };

  const handleDecimateInputKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    handleDecimateApply();
  };

  const handlePersistentToggle = () => {
    dispatch(setOption({ key: "persistent", value: !persistent }));
  };

  const maskingFunction = useSelector((state) => state.masking.function);
  const maskingForm = useSelector((state) => state.masking.form);

  // const [selectedPreset, setSelectedPreset] = useState(preset3d);

  // The selection (scissors) button stays disabled until the image finishes
  // loading and its segmentation is active (AllowSegmentationDrawing fires).
  const [selectionReady, setSelectionReady] = useState(false);

  const manager = useToolsManager({
    toolGroup,
    toolGroup3d,
    defaultLeftClickMode: globalToolsConfig.leftClickToolGroup.defaultValue,
    defaultRightClickMode: globalToolsConfig.rightClickToolGroup.defaultValue,
    renderingEngine,
  });
  const toolsConfigs = useToolsConfigs({ manager, selectionReady });

  // The AllowSegmentationDrawing listener below is registered once on mount, so
  // it must reach the manager through a ref that every render refreshes rather
  // than closing over the mount-time `manager`. On IEC navigation the tool group
  // is destroyed and recreated: this panel remounts (keyed on iec) while
  // MaskIEC's toolGroup state still points at the old group, then re-renders
  // with the new one. A listener that captured `manager` at mount would keep
  // arming the scissors on the destroyed tool group, so the selection tool
  // silently fails to activate on the new image until the user clicks the
  // Selection button (which runs through the current render's manager).
  const managerRef = useRef(manager);
  managerRef.current = manager;

  useEffect(() => {
    // The left-click drawing tool stays disabled while the image loads (see
    // toolsManager). Each viewport fires "AllowSegmentationDrawing" once its
    // segmentation is active — the point drawing becomes safe. Enabling any
    // earlier throws "No active segmentation detected".
    const handler = (evt) => {
      // Before enabling the scissors, make sure the segmentation is active on
      // every 2D drawing pane — not just the one that fired — so drawing in any
      // pane can't hit "No active segmentation" while the others are still
      // finishing setup. Panes without the rep yet are skipped; they'll fire
      // their own event and re-run this handler once they're ready.
      const readySegmentationId = evt.detail?.segmentationId;
      if (readySegmentationId) {
        cornerstone
          .getRenderingEngines()[0]
          ?.getViewports()
          .forEach((vp) => {
            if (vp.id.startsWith("coronal3d")) return; // 3D pane: no drawing
            try {
              cornerstoneTools.segmentation.activeSegmentation.setActiveSegmentation(
                vp.id,
                readySegmentationId,
              );
            } catch {
              // Segmentation not represented in this viewport yet — ignore.
            }
          });
      }
      // The image is loaded and its segmentation is active, so the selection
      // (scissors) button is now safe to use — enable it.
      setSelectionReady(true);
      managerRef.current.switchLeftClickMode(Enums.LeftClickOptions.SELECTION);
    };
    cornerstone.eventTarget.addEventListener(
      "AllowSegmentationDrawing",
      handler,
    );
    return () => {
      cornerstone.eventTarget.removeEventListener(
        "AllowSegmentationDrawing",
        handler,
      );
    };
  }, []);

  const handlePresetChange = (event) => {
    const newPreset = event.target.value;
    console.log("Selected Preset:", newPreset);
    // setSelectedPreset(newPreset);
    onPresetChange(newPreset);
  };

  return (
    <div id="tools-panel" className="side-panel">
      <h2 id="title">Tools</h2>
      <div className="wrapper">
        {globalToolsConfig.viewToolGroup.visible && (
          <div>
            <p>View:</p>
            <MaterialButtonSet
              buttonConfig={toolsConfigs.viewGroupButtonConfig}
              initialActiveButton={toTitleCase(globalStateValues.view)}
            />
          </div>
        )}
        {globalToolsConfig.leftClickToolGroup.visible && (
          <div>
            <p>Left-Click:</p>
            <MaterialButtonSet
              buttonConfig={toolsConfigs.leftClickGroupButtonConfig}
              initialActiveButton={toTitleCase(globalStateValues.leftClick)}
            />
          </div>
        )}
        {globalToolsConfig.rightClickToolGroup.visible && (
          <div>
            <p>Right-Click:</p>
            <MaterialButtonSet
              buttonConfig={toolsConfigs.rightClickGroupButtonConfig}
              initialActiveButton={toTitleCase(globalStateValues.rightClick)}
            />
          </div>
        )}
        {globalToolsConfig.resetToolGroup.visible && (
          <div>
            <p>Reset Camera:</p>
            {/* One-shot action, so noRemember keeps it from staying highlighted. */}
            <MaterialButtonSet
              noRemember
              buttonConfig={[
                {
                  name: "Reset Zoom & Pan",
                  icon: "restart_alt",
                  action: () => resetViewportsView(),
                },
              ]}
            />
          </div>
        )}
        {decimateToolGroup.visible && (
          <div className="decimate-control">
            <p>Decimate:</p>
            <div className="decimate-control-row">
              <input
                type="text"
                id="decimate-input"
                value={appliedDecimate}
                onChange={handleDecimateChange}
                onKeyDown={handleDecimateInputKeyDown}
                className="decimate-input"
                placeholder="300"
              />
              <button
                type="button"
                title="Persistent"
                className={`decimate-action-btn persistent-btn ${persistent ? "is-active" : ""}`}
                aria-label="Persistent"
                aria-pressed={persistent}
                onClick={handlePersistentToggle}
              >
                <span className="decimate-btn-icon">✓</span>
                <span className="decimate-tooltip">Persistent</span>
              </button>
              <button
                type="button"
                title="Refresh"
                className="decimate-action-btn refresh-btn"
                aria-label="Refresh"
                onClick={handleDecimateApply}
              >
                <span className="decimate-btn-icon">↻</span>
                <span className="decimate-tooltip">Refresh</span>
              </button>
            </div>
          </div>
        )}
        {globalToolsConfig.presetToolGroup.visible && (
          <div>
            <p>Preset:</p>
            <div className="preset-dropdown-container">
              {/* <label htmlFor="preset-select">Preset:</label> */}
              <select
                id="preset-select"
                value={preset3d}
                onChange={handlePresetChange}
                className="preset-select"
              >
                {presets.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {opacityToolGroup.visible && (
          <div className="opacity-control">
            <p>
              Opacity: <span>{opacity.toFixed(1)}</span>
            </p>
            <input
              type="range"
              min={opacityToolGroup.min}
              max={opacityToolGroup.max}
              step={opacityToolGroup.step}
              value={opacity}
              onChange={handleOpacityChange}
            />
          </div>
        )}
        {globalToolsConfig.functionToolGroup.visible && (
          <div>
            <p>Function:</p>
            <MaterialButtonSet
              buttonConfig={toolsConfigs.functionGroupButtonConfig}
              initialActiveButton={toTitleCase(globalStateValues.function)}
            />
          </div>
        )}
        {globalToolsConfig.formToolGroup.visible && (
          <div>
            <p>Form:</p>
            <MaterialButtonSet
              buttonConfig={toolsConfigs.formGroupButtonConfig}
              initialActiveButton={toTitleCase(globalStateValues.form)}
            />
          </div>
        )}
        {globalToolsConfig.filterToolGroup.visible && (
          <div className="mask-filters">
            <div className="noise-control">
              <p>Noise: {noise}</p>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={noise}
                onChange={handleNoiseChange}
              />
            </div>
            <div className="fill-control">
              <p>Fill: {fill}</p>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={fill}
                onChange={handleFillChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
