import { eventTarget, Enums } from "@cornerstonejs/core";
import { wadouri } from "@cornerstonejs/dicom-image-loader";

import { notify } from "@/lib/notify";

/**
 * Frames of a QC series whose file has no pixel data, such as a structured
 * report (SR). The image loader parses such a file and then fails to make an
 * image of it ("The pixel data is missing"). The QC page shows "No pixel data"
 * for these frames in place of an error, and still dumps the parsed file.
 */

// The loader's own error message for a file with no pixel data.
const PIXEL_DATA_MISSING = "The pixel data is missing";

// Parsed files with no pixel data, by wadouri url.
const dataSetsByUrl = new Map();
// Frames (image ids) found to have no pixel data.
const imageIds = new Set();

// The loader rejects with { error, dataSet }; Cornerstone may pass that on as
// is, or just the inner error.
function isPixelDataMissing(error) {
  const message = error?.error?.message ?? error?.message;
  return message === PIXEL_DATA_MISSING;
}

/** Whether `imageId` is a frame found to have no pixel data. */
export function hasNoPixelData(imageId) {
  return Boolean(imageId) && imageIds.has(imageId);
}

/** The parsed file at wadouri `url`, if it was found to have no pixel data. */
export function noPixelDataSet(url) {
  return dataSetsByUrl.get(url) ?? null;
}

/**
 * Watch for frames of `viewport` that fail for want of pixel data. Each one
 * is remembered, its error is marked handled so it doesn't toast, and, if it
 * is the frame the viewport is on, `onCurrentFrame(imageId)` is called.
 *
 * @param {() => object | undefined} getViewport the QC stack viewport
 * @param {(imageId: string) => void} onCurrentFrame
 * @returns {() => void} stops watching and forgets the frames
 */
export function watchNoPixelData(getViewport, onCurrentFrame) {
  const onLoadError = (evt) => {
    const { imageId, error } = evt.detail ?? {};
    if (!imageId || !isPixelDataMissing(error)) return;

    notify.markHandled(error);
    notify.markHandled(error?.error);

    imageIds.add(imageId);
    const dataSet = error?.dataSet;
    if (dataSet) {
      dataSetsByUrl.set(wadouri.parseImageId(imageId).url, dataSet);
    }

    // A frame scrolled past may fail after a later one is on screen.
    if (getViewport()?.getCurrentImageId() === imageId) {
      onCurrentFrame(imageId);
    }
  };

  eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_ERROR, onLoadError);
  return () => {
    eventTarget.removeEventListener(Enums.Events.IMAGE_LOAD_ERROR, onLoadError);
    imageIds.clear();
    dataSetsByUrl.clear();
  };
}
