import React, { useState, useEffect } from 'react';

import { RenderingEngine } from "@cornerstonejs/core"
import * as cornerstone from "@cornerstonejs/core"
import * as cornerstoneTools from '@cornerstonejs/tools';
import useRendererResize from '@/hooks/useRendererResize';
import { setOption } from '@/features/optionSlice';
import { useDispatch } from 'react-redux';

import StackViewport from '@/components/StackViewport';
import { ToolsPanel } from '@/features/tools';

import ViewerResizer from '@/components/ViewerResizer';

import './StackView.css';

const {
  ToolGroupManager,
  TrackballRotateTool,
  BrushTool,
  RectangleScissorsTool,
  StackScrollTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';


export default function StackView({
  frames,
  segmentationId,
  toolGroup,
  // onToggleLeftPanel,
  // onToggleRightPanel,
}) {
  const [renderingEngine, setRenderingEngine] = useState();
  const dispatch = useDispatch();

  useRendererResize(renderingEngine);

  useEffect(() => {
    cornerstoneTools.addTool(TrackballRotateTool);
    cornerstoneTools.addTool(StackScrollTool);

    // Only create a new rendering engine if one doesn't already exist
    let renderingEngine = cornerstone.getRenderingEngine("re1");
    if (renderingEngine === undefined) {
      renderingEngine = new RenderingEngine("re1");
    }


    // TODO: this is for debu use only
    window.ToolGroupManager = ToolGroupManager;
    window.renderingEngine = renderingEngine;
    window.toolGroup2d = toolGroup;

    setRenderingEngine(renderingEngine);

    cornerstone.triggerEvent(cornerstone.eventTarget, 'AllowSegmentationDrawing', {});

    // Teardown function
    return () => {
    };
  }, []);

  function handleImageChange(imageId) {
    dispatch(setOption({
      key: 'currentImageId',
      value: imageId,
    }));
  }

  if (renderingEngine == null) {
    return <div>Loading...</div>;
  }

  return (
    <div id="stack-view"
      className="viewer">
      <ViewerResizer />

      {/* <div id="viewer-resizer">
        <button
          id="left-resize-button"
          className="material-symbols-rounded"
          onClick={e => {
            e.currentTarget.classList.toggle("flipped");
            onToggleLeftPanel(e);
          }}
        >chevron_left</button>
        <button
          id="right-resize-button"
          className="material-symbols-rounded"
          onClick={e => {
            e.currentTarget.classList.toggle("flipped");
            onToggleRightPanel(e);
          }}
        >chevron_right</button>
      </div> */}

      <StackViewport
        onImageChange={handleImageChange}
        frames={frames}
        toolGroup={toolGroup}
        renderingEngine={renderingEngine}
        segmentationId={segmentationId}
        viewportId="myviewport"
      />
    </div>
  );
}
