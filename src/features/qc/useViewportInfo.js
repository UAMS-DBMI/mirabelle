import { useState, useEffect } from "react";

import * as cornerstone from "@cornerstonejs/core";

import { getQCViewport } from "./viewport";

const EMPTY = { zoom: null, windowCenter: null, windowWidth: null };

/**
 * Live zoom and window level/width of the QC stack viewport, for the
 * toolbar zoom label and the viewport corner overlays. Re-subscribes per
 * displayed image; `currentImageId` doubles as the "viewport exists now"
 * signal since it is set by the viewport's first STACK_NEW_IMAGE event.
 */
export default function useViewportInfo(currentImageId) {
  const [info, setInfo] = useState(EMPTY);

  useEffect(() => {
    const viewport = getQCViewport();
    if (!currentImageId || !viewport?.element) {
      setInfo(EMPTY);
      return;
    }

    const update = () => {
      const voiRange = viewport.getProperties()?.voiRange;
      setInfo({
        zoom: viewport.getZoom(),
        windowCenter: voiRange
          ? Math.round((voiRange.lower + voiRange.upper) / 2)
          : null,
        windowWidth: voiRange
          ? Math.round(voiRange.upper - voiRange.lower)
          : null,
      });
    };

    update();

    const { element } = viewport;
    const { CAMERA_MODIFIED, VOI_MODIFIED } = cornerstone.Enums.Events;
    element.addEventListener(CAMERA_MODIFIED, update);
    element.addEventListener(VOI_MODIFIED, update);
    return () => {
      element.removeEventListener(CAMERA_MODIFIED, update);
      element.removeEventListener(VOI_MODIFIED, update);
    };
  }, [currentImageId]);

  return info;
}
