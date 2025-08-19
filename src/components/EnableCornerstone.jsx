import React, { useState, useEffect } from 'react';

import {
  RenderingEngine,
  Enums,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader
} from "@cornerstonejs/core"
import * as cornerstone from "@cornerstonejs/core"
import { init as csRenderInit, imageLoader } from "@cornerstonejs/core"
import { init as csToolsInit } from "@cornerstonejs/tools"
import * as cornerstoneTools from '@cornerstonejs/tools'
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader"
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader"
import { cornerstoneNiftiImageLoader } from '@cornerstonejs/nifti-volume-loader'
import * as polySeg from '@cornerstonejs/polymorphic-segmentation'

import './EnableCornerstone.css';


volumeLoader.registerUnknownVolumeLoader(
  cornerstoneStreamingImageVolumeLoader
)


function EnableCornerstone({ children }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      // new 2.0 init routines
      await csRenderInit()
      await csToolsInit({
        addons: {
          polySeg,
        },
      })
      dicomImageLoaderInit({
        maxWebWorkers: 5,
        startWebWorkersOnDemand: true,
      });

      imageLoader.registerImageLoader('nifti', cornerstoneNiftiImageLoader);

      window.cornerstoneTools = cornerstoneTools;
      window.cornerstone = cornerstone;
      window.polyseg = polySeg;
      window.cornerstoneDicomImageLoader = cornerstoneDicomImageLoader;

      new cornerstone.RenderingEngine("re1");

      setIsInitialized(true);
    };

    initialize();
  }, []); // passing no value causes this to run ONLY ONCE during mount

  // short-circuit if Cornerstone hasn't loaded yet
  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {children}
    </>
  );
};

export default EnableCornerstone;
