/**
 **/
import React, { useState, useEffect, useRef } from 'react';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core";
import { useSelector, useDispatch } from 'react-redux';
import { setPresets } from '@/features/presentationSlice';

import './VolumeViewport3d.css';

const {
  CONSTANTS,
  setVolumesForViewports,
} = cornerstone;

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

function VolumeViewport3d({ viewportId, renderingEngine, toolGroup, volumeId, orientation, preset3d }) {
  const dispatch = useDispatch();
  const elementRef = useRef(null);

  const opacity = useSelector(state => state.options.opacity);

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

  const segmentationIds = segmentation.state
    .getSegmentations()
    .map((seg) => seg.segmentationId);

  useEffect(() => {
    const setup = async () => {

      const viewportInputArray = {
        viewportId,
        type: Enums.ViewportType.VOLUME_3D,
        element: elementRef.current,
        defaultOptions: {
          orientation: realOrientation,
        },
      };

      renderingEngine.enableElement(viewportInputArray);

      // Enable double click to toggle viewport size
      function toggleViewportSize(wrapper) {
        /* A hack to force-render a 3d viewport */
        Array.from(wrapper.parentNode.children)
          .filter(child => child !== wrapper)
          .forEach((child) => {
            child.classList.toggle('minimized');
          });
        wrapper.classList.toggle('expanded');
        wrapper.parentElement.classList.toggle('expanded');
        renderingEngine.resize(true, true);
        renderingEngine.render();
      }

      // Get the volume viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);
      const wrapper = viewport.element;

      wrapper.addEventListener(
        'dblclick',
        () => toggleViewportSize(wrapper)
      );

      toolGroup.addViewport(viewportId, renderingEngine.id);

      // Set the volume on the viewport and it's default properties
      // viewport.setVolumes([{ volumeId }])
      await setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId]
      )
      await viewport.setProperties({
        // preset: 'CT-MIP',
        // preset: 'MR-T2-Brain',
        // preset: 'MR-Default',
        preset: preset3d,
      });

      // Apply all active segmentations to the viewport

      if (segmentationIds) {
        // TODO: temp fix, this suppresses render of mask segs alltogether. Need instead
        // a way to signal when the expand has happened and it's safe to display?
        // note that currently it is being applied directly from elsewhere
        const nonMaskSegmentationIds = segmentationIds.filter(segmentationId => !segmentationId.startsWith('mask-'));
        console.log("VolumeViewport3d: Applying segmentationIds=", nonMaskSegmentationIds);
        await segmentation.addSegmentationRepresentations(
          viewportId, 
          nonMaskSegmentationIds.map((segmentationId) => ({
            segmentationId,
            type: csToolsEnums.SegmentationRepresentations.Surface,
          })),
        );
      }

      // Render the image
      viewport.render()

    }

    setup()
  }, [elementRef, volumeId, segmentationIds.length]);

  // Update scalar opacity
  useEffect(() => {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) return;

    const actorEntry = viewport.getActors()[0];
    if (!actorEntry?.actor) return;
    const volumeActor = actorEntry.actor;
    const property = volumeActor.getProperty();
    const fn = property.getScalarOpacity(0);

    fn.removeAllPoints();
    fn.addPoint(0, 0.0);
    fn.addPoint(500, opacity);
    fn.addPoint(1000, opacity);
    fn.addPoint(1500, opacity);
    fn.addPoint(2000, opacity);

    property.setScalarOpacity(0, fn);
    viewport.render();
  }, [renderingEngine, viewportId, opacity]);

  // useEffect(() => {
  //   console.log("[VolumeViewport3d] preset3d changed", preset3d);
  //   const viewport = renderingEngine.getViewport(viewportId);
  //   viewport.setProperties({
  //     preset: preset3d,
  //   });
  //   viewport.render();
  // }, [preset3d]);


  return (
    <div
      id={viewportId}
      ref={elementRef}
      onContextMenu={(e) => e.preventDefault()}
      className="volume-viewport viewport"
    ></div>
  )
}

export default VolumeViewport3d;
