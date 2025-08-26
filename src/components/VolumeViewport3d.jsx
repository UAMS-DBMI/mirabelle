/**
 **/
import React, { useState, useEffect, useRef } from 'react';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core";
import { useSelector, useDispatch } from 'react-redux';
import { setPresets } from '@/features/presentationSlice';
import { setOption } from '@/features/optionSlice';

import './VolumeViewport3d.css';

import { eventTarget } from '@cornerstonejs/core';

const { Events } = Enums;

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

function VolumeViewport3d({ viewportId, renderingEngine, toolGroup, volumeId, orientation, preset3d, modality }) {
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
    const wrapper = elementRef.current
    if (!wrapper || !renderingEngine) return

    // Enable double click to toggle viewport size
    function toggleViewportSize() {
      Array.from(wrapper.parentNode.children)
        .filter(child => child !== wrapper)
        .forEach(child => child.classList.toggle('minimized'))
      wrapper.classList.toggle('expanded')
      wrapper.parentElement.classList.toggle('expanded')

      /* A hack to force-render a 3d viewport */
      renderingEngine.resize(true, true)
      renderingEngine.render()
    }

    wrapper.addEventListener('dblclick', toggleViewportSize)
    return () => {
      wrapper.removeEventListener('dblclick', toggleViewportSize)
    }
  }, [renderingEngine])

  const detectModalityFromImageData = (imageData) => {
    if (!imageData) {
      console.log('No image data available for modality detection, defaulting to MR');
      return 'MR';
    }

    try {
      const values = Array.from(imageData).filter(v => !isNaN(v) && isFinite(v));
      if (values.length === 0) {
        console.log('No valid image values found, defaulting to MR');
        return 'MR';
      }

      values.sort((a, b) => a - b);
      const min = values[0];
      const max = values[values.length - 1];
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const range = max - min;

      // Calculate some additional statistics for better detection
      const negativeCount = values.filter(v => v < 0).length;
      const negativePercentage = negativeCount / values.length;

      console.log(`Image data analysis - Range: ${min}-${max} (${range}), Mean: ${mean.toFixed(2)}, Negative: ${(negativePercentage * 100).toFixed(1)}%`);

      // CT characteristics: 
      // - Has significant negative values (air ~-1000 HU)
      // - Wide range including high positive values (bone 400-3000+ HU)
      // - Typically ranges from -1000 to +3000 or more
      if (negativePercentage > 0.05 && min < -200 && max > 1000 && range > 2000) {
        console.log('Detected CT based on Hounsfield Unit characteristics');
        return 'CT';
      }

      // PET characteristics:
      // - Typically all positive values (SUV units)
      // - Narrow range, usually 0-50 SUV, rarely exceeds 100
      // - Mean typically in low single digits for most tissues
      if (min >= 0 && max < 100 && mean > 0.05 && mean < 20 && range < 100) {
        console.log('Detected PET based on SUV-like characteristics');
        return 'PT';
      }

      // MR characteristics:
      // - Arbitrary positive intensities (sequence dependent)
      // - Usually 0 to several thousand
      // - No negative values (or very few due to noise)
      // - Wide variation depending on sequence parameters
      if (negativePercentage < 0.01 && min >= 0 && max > 100) {
        // Further distinguish between PET and MR based on typical ranges
        if (max > 1000 || (max > 500 && mean > 50)) {
          console.log('Detected MR based on typical intensity characteristics');
          return 'MR';
        }
      }

      // Edge cases and additional heuristics

      // Very high dynamic range suggests CT with contrast or metal artifacts
      if (range > 5000) {
        console.log('Detected CT based on very high dynamic range');
        return 'CT';
      }

      // Very low range with positive values suggests PET
      if (min >= 0 && range < 50 && max < 50) {
        console.log('Detected PET based on low dynamic range');
        return 'PT';
      }

      // Default fallback based on most common characteristics
      if (negativePercentage > 0.01) {
        console.log('Defaulting to CT due to presence of negative values');
        return 'CT';
      } else {
        console.log('Defaulting to MR for positive-only intensity range');
        return 'MR';
      }

    } catch (error) {
      console.warn('Error analyzing image data for modality detection:', error);
      return 'MR'; // Safe default
    }
  };

  // Set default preset based on modality
  const getDefaultPresetForModality = (modality, currentPreset) => {
    // If a preset is already explicitly set, use it
    if (currentPreset && currentPreset !== 'CT-MIP') return currentPreset;

    switch (modality?.toUpperCase()) {
      case 'PT':
      case 'PET':
        return 'CT-AAA';
      case 'MR':
      case 'MRI':
        return 'MR-Angio';
      case 'CT':
      default:
        return 'CT-MIP';
    }
  };

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

      // Get the volume viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);

      toolGroup.addViewport(viewportId, renderingEngine.id);

      // Set the volume on the viewport and it's default properties
      // viewport.setVolumes([{ volumeId }])
      await setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId]
      )

      // Detect modality if not provided (for any volume type)
      let effectiveModality = modality;
      if (!effectiveModality) {
        try {
          const volume = cornerstone.cache.getVolume(volumeId);
          if (volume) {
            const scalarData = volume.getScalarData();
            effectiveModality = detectModalityFromImageData(scalarData);
            console.log(`Auto-detected modality for preset selection: ${effectiveModality}`);
          }
        } catch (error) {
          console.warn('Error detecting modality for preset, using default:', error);
          effectiveModality = 'MR';
        }
      }

      // Set default preset based on modality
      const defaultPreset = getDefaultPresetForModality(effectiveModality, preset3d);
      console.log(`Setting preset: ${defaultPreset} for modality: ${effectiveModality}`);

      await viewport.setProperties({
        preset: defaultPreset,
      });

      // Notify parent if preset was auto-selected and differs from current
      if (defaultPreset !== preset3d) {
        dispatch(setOption({ key: 'preset', value: defaultPreset }));
      }

      // // Apply all active segmentations to the viewport
      // if (segmentationIds) {
      //   // TODO: temp fix, this suppresses render of mask segs alltogether. Need instead
      //   // a way to signal when the expand has happened and it's safe to display?
      //   // note that currently it is being applied directly from elsewhere
      //   const nonMaskSegmentationIds = segmentationIds.filter(segmentationId => !segmentationId.startsWith('mask-'));
      //   console.log("VolumeViewport3d: Applying segmentationIds=", nonMaskSegmentationIds);
      //   await segmentation.addSegmentationRepresentations(
      //     viewportId,
      //     nonMaskSegmentationIds.map((segmentationId) => ({
      //       segmentationId,
      //       type: csToolsEnums.SegmentationRepresentations.Surface,
      //     })),
      //   );
      // }


      // Render the image
      viewport.render()

      const actor = viewport.getDefaultActor().actor;
      const mapper = actor.getMapper();
      mapper.setMaximumSamplesPerRay(10000);

    }

    setup()
    return () => {
      segmentation.removeAllSegmentationRepresentations();
    };
  }, [elementRef, volumeId]);

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
