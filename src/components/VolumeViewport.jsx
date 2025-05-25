/**
 * Simple volume display panel. Assumes the volume has already
 * been created and loaded into the cache. Accepts volumeId as a prop
 **/
import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core"

import './VolumeViewport.css';

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

function VolumeViewport({
  viewportId,
  renderingEngine,
  voiSynchronizer,
  toolGroup,
  volumeId,
  orientation,
  segmentationId
}) {
  const viewMode = useSelector(state => state.options.view);
  const [initialized, setInitialized] = useState(false);

  console.log("[VolumeViewport] rendering, volumeId=", volumeId)
  const elementRef = useRef(null);

  window.re = renderingEngine;

  let realOrientation = Enums.OrientationAxis.ACQUISITION;
  if (orientation == 'SAGITTAL') {
    realOrientation = Enums.OrientationAxis.SAGITTAL;
  }
  if (orientation == 'AXIAL') {
    realOrientation = Enums.OrientationAxis.AXIAL;
  }
  if (orientation == 'CORONAL') {
    realOrientation = Enums.OrientationAxis.CORONAL;
  }


  useEffect(() => {
    const setup = async () => {
      console.log("[VolumeViewport] setup running");

      const viewportInput = {
        viewportId,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: elementRef.current,
        defaultOptions: {
          orientation: realOrientation,
        },
      }

      renderingEngine.enableElement(viewportInput);

      console.log("voi sync", voiSynchronizer);

      voiSynchronizer.add({
        renderingEngineId: renderingEngine.id,
        viewportId,
      });

      // Get the stack viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);

      toolGroup.addViewport(viewportId, renderingEngine.id);

      // Set the volume on the viewport and it's default properties
      viewport.setVolumes([{ volumeId }])

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

      setInitialized(true);
    }

    setup()
  }, [elementRef, volumeId])

  useEffect(() => {
    // Don't attempt to reset during initialization, as global
    // properites may not be set yet
    if (!initialized) return;

    const viewport = renderingEngine.getViewport(viewportId);
    const volume = cornerstone.cache.getVolume(volumeId);
    const volDimensions = volume.dimensions;

    if (viewMode === 'projection') {
      const volSlab = Math.sqrt(
        volDimensions[0] * volDimensions[0] +
        volDimensions[1] * volDimensions[1] +
        volDimensions[2] * volDimensions[2]
      );

      viewport.setBlendMode(cornerstone.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
      viewport.setSlabThickness(volSlab);
    } else {
      console.log("Resetting viewport to default properties:", viewportId);
      viewport.resetProperties();
      viewport.resetToDefaultProperties();
    }

    viewport.render();
  }, [viewMode]);

  return (
    <>
      <div
        id={viewportId}
        ref={elementRef}
        onContextMenu={(e) => e.preventDefault()}
        className="volume-viewport viewport"
      ></div>
    </>
  )
}

export default VolumeViewport;
