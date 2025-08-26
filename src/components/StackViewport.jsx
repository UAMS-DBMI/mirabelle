/**
 * Simple stack display panel. 
 **/
import React, { useState, useEffect, useRef } from 'react';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core"
import LoadingSpinner from '@/components/LoadingSpinner';

import './StackViewport.css';

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  PlanarRotateTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { segmentation: segmentationUtils } = cstUtils;

const { ViewportType } = Enums;

function StackViewport({
  frames,
  mip,
  viewportId,
  renderingEngine,
  toolGroup,
  segmentationId,
  onImageChange,
}) {
  console.log("[StackViewport] rendering")
  const elementRef = useRef(null);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    //console.log("[StackViewport] useEffect triggered");
    //console.log("frames:", frames);

    const setup = async () => {
      if (frames === undefined) {
        return;
      }
      console.log("[StackViewport] setup running");

      // Listen to some events from the viewport
      elementRef.current.addEventListener(
        cornerstone.Enums.Events.STACK_NEW_IMAGE,
        (evt) => {
          if (onImageChange) {
            onImageChange(evt.detail.image.imageId);
          }
        }
      );


      const viewportInput = {
        viewportId,
        type: Enums.ViewportType.STACK,
        element: elementRef.current,
      }

      renderingEngine.enableElement(viewportInput)

      // Get the stack viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);

      toolGroup.addViewport(viewportId, renderingEngine.id);

      await viewport.setStack(frames);

      await segmentation.addLabelmapRepresentationToViewportMap({
        [viewportId]: [
          {
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          }
        ],
      });

      // Render the image
      viewport.render()
      window.viewport = viewport;




      setInitialized(true);
    }

    setup()
  }, [elementRef, frames])

  return (
    <>
      <div
        ref={elementRef}
        onContextMenu={(e) => e.preventDefault()}
        className="stack-viewport viewport"
      ></div>
    </>
  )
}

export default StackViewport;
