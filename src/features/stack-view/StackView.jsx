import React, { useState, useEffect } from 'react';

import { RenderingEngine } from "@cornerstonejs/core"
import * as cornerstone from "@cornerstonejs/core"
import * as cornerstoneTools from '@cornerstonejs/tools';
import useRendererResize from '@/hooks/useRendererResize';

import StackViewport from '@/components/StackViewport';
import { ToolsPanel } from '@/features/tools';

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


export default function StackView({ frames, segmentationId, toolGroup }) {
  const [renderingEngine, setRenderingEngine] = useState();

  const [mip, setMip] = useState(false);

  useRendererResize(renderingEngine);

  useEffect(() => {
    cornerstoneTools.addTool(TrackballRotateTool);
    cornerstoneTools.addTool(BrushTool);
    cornerstoneTools.addTool(RectangleScissorsTool);
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

    // Teardown function
    return () => {
    };
  }, []);

  if (renderingEngine == null) {
    return <div>Loading...</div>;
  }

  return (
    <div id="stack-view"
      className="viewer">
      <StackViewport
        frames={frames}
        toolGroup={toolGroup}
        renderingEngine={renderingEngine}
        segmentationId={segmentationId}
        viewportId="myviewport"
      />
    </div>
  );
}