import React, { useState, useContext } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setOption } from '@/features/optionSlice';

import * as cornerstoneTools from '@cornerstonejs/tools';

import MaterialButtonSet from '@/components/MaterialButtonSet';

import useToolsManager from './toolsManager';
import useToolsConfigs from './toolsConfig';

import './ToolsPanel.css';

function toTitleCase(some_string) {
  return some_string.replace("_", " ").replace(
    /\w\S*/g,
    (txt) => {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
};

export default function ToolsPanel({
  toolGroup,
  toolGroup3d,
  onPresetChange,
  defaultPreset,
  renderingEngine
}) {
  const dispatch = useDispatch();

  const presets = useSelector(state => state.presentation.presets);
  const globalToolsConfig = useSelector(state => state.presentation.toolsConfig);
  const globalStateValues = useSelector(state => state.options);

  // pull opacity config + value from Redux
  const { opacityToolGroup } = globalToolsConfig;
  const opacity = globalStateValues.opacity;

  const handleOpacityChange = e => {
    const value = parseFloat(e.target.value);
    dispatch(setOption({ key: 'opacity', value }));
  };

  const maskingFunction = useSelector(state => state.masking.function);
  const maskingForm = useSelector(state => state.masking.form);

  const [selectedPreset, setSelectedPreset] = useState(defaultPreset);

  const manager = useToolsManager({
    toolGroup,
    toolGroup3d,
    defaultLeftClickMode: globalToolsConfig.leftClickToolGroup.defaultValue,
    defaultRightClickMode: globalToolsConfig.rightClickToolGroup.defaultValue,
    renderingEngine,
  });
  const toolsConfigs = useToolsConfigs({ manager });

  const handlePresetChange = (event) => {
    const newPreset = event.target.value;
    console.log("Selected Preset:", newPreset);
    setSelectedPreset(newPreset);
    onPresetChange(newPreset);
  };

  return (
    <div id="tools-panel" className="side-panel">
      {
        globalToolsConfig.viewToolGroup.visible &&
        <div>
          <p>View:</p>
          <MaterialButtonSet
            buttonConfig={toolsConfigs.viewGroupButtonConfig}
            initialActiveButton={toTitleCase(globalStateValues.view)}
          />
        </div>
      }
      {
        globalToolsConfig.functionToolGroup.visible &&
        <div>
          <p>Function:</p>
          <MaterialButtonSet
            buttonConfig={toolsConfigs.functionGroupButtonConfig}
            initialActiveButton={toTitleCase(globalStateValues.function)}
          />
        </div>
      }
      {
        globalToolsConfig.formToolGroup.visible &&
        <div>
          <p>Form:</p>
          <MaterialButtonSet
            buttonConfig={toolsConfigs.formGroupButtonConfig}
            initialActiveButton={toTitleCase(globalStateValues.form)}
          />
        </div>
      }
      {
        globalToolsConfig.leftClickToolGroup.visible &&
        <div>
          <p>Left-Click:</p>
          <MaterialButtonSet
            buttonConfig={toolsConfigs.leftClickGroupButtonConfig}
            initialActiveButton={toTitleCase(globalStateValues.leftClick)}
          />
        </div>
      }
      {
        globalToolsConfig.rightClickToolGroup.visible &&
        <div>
          <p>Right-Click:</p>
          <MaterialButtonSet
            buttonConfig={toolsConfigs.rightClickGroupButtonConfig}
            initialActiveButton={toTitleCase(globalStateValues.rightClick)}
          />
        </div>
      }
      {opacityToolGroup.visible && (
        <div className="opacity-control">
          <p>Opacity <span>{opacity.toFixed(1)}:</span></p>
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
      {
        globalToolsConfig.presetToolGroup.visible &&
        <div>
          <p>Preset:</p>
          <div className="preset-dropdown-container">
            {/* <label htmlFor="preset-select">Preset:</label> */}
            <select
              id="preset-select"
              value={selectedPreset}
              onChange={handlePresetChange}
              className="preset-select"
            >
              {presets.map(preset => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
    </div>
  );
}
