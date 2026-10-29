import React, { useState, useEffect } from "react";

import {
  RenderingEngine,
  Enums,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader,
} from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import { init as csRenderInit, imageLoader } from "@cornerstonejs/core";
import { init as csToolsInit } from "@cornerstonejs/tools";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import * as cornerstoneDicomImageLoader from "@cornerstonejs/dicom-image-loader";
import { cornerstoneNiftiImageLoader } from "@cornerstonejs/nifti-volume-loader";
import safePolySeg from "@/lib/safePolySeg";

import configureCacheSize from "@/lib/cacheSizing";
import { openDicomRequest, uncapImageLoadPool } from "@/lib/examDownloads";

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
          polySeg: safePolySeg,
        },
      });
      dicomImageLoaderInit({
        maxWebWorkers: 5,
        startWebWorkersOnDemand: true,
        // Sends DICOM file requests from a queue, so an exam the curator
        // leaves mid-load can pause its download (lib/examDownloads).
        open: openDicomRequest,
      });
      // Paused exams' waiting frames must not use up Cornerstone's pool of
      // image loads, or the exam on screen can't start (lib/examDownloads).
      uncapImageLoadPool();

      // Size the image cache from the machine's memory (more cached exams on
      // machines that can afford it) — must run before any volume loads.
      configureCacheSize();

      imageLoader.registerImageLoader("nifti", cornerstoneNiftiImageLoader);

      window.cornerstoneTools = cornerstoneTools;
      window.cornerstone = cornerstone;
      window.polyseg = safePolySeg;
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
