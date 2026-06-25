import React, { useState, useEffect } from "react";

import {
  RenderingEngine,
  Enums,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader,
  imageLoadPoolManager,
} from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import { init as csRenderInit, imageLoader } from "@cornerstonejs/core";
import { init as csToolsInit } from "@cornerstonejs/tools";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import { cornerstoneNiftiImageLoader } from "@cornerstonejs/nifti-volume-loader";
import * as polySeg from "@cornerstonejs/polymorphic-segmentation";

import "./EnableCornerstone.css";

volumeLoader.registerUnknownVolumeLoader(cornerstoneStreamingImageVolumeLoader);

function EnableCornerstone({ children }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      // new 2.0 init routines
      await csRenderInit();
      await csToolsInit({
        addons: {
          polySeg,
        },
      });
      // Scale decode workers to the machine: navigator.hardwareConcurrency
      // is the number of logical cores (fallback to 4 on the rare browser
      // that doesn't report it). We subtract one and floor at 1 to leave a
      // core for the main/UI thread — decode isn't our bottleneck (read
      // speed off the server's storage is), so on the low-spec systems this
      // runs on it's better to keep the UI responsive than to squeeze out
      // marginally faster decode by claiming every core.
      const maxWebWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
      dicomImageLoaderInit({
        maxWebWorkers,
        startWebWorkersOnDemand: true,
      });

      // Volume frame loads run through the image-load pool as Prefetch
      // requests, which cornerstone caps at 5 concurrent by default. Raise
      // it so more frames download in parallel. Decode runs on the web
      // worker pool above (maxWebWorkers), so keep the two roughly balanced.
      imageLoadPoolManager.setMaxSimultaneousRequests(
        Enums.RequestType.Prefetch,
        20,
      );

      imageLoader.registerImageLoader("nifti", cornerstoneNiftiImageLoader);

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

  return <>{children}</>;
}

export default EnableCornerstone;
