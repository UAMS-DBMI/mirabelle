/**
 * Renders one image into a canvas, for the stack's slice browser thumbnails.
 *
 * Cornerstone's loadImageToCanvas does this, but it doesn't pass a render
 * error on: the error escapes as an uncaught rejection (an error toast) and
 * the promise it returned never settles. And rendering throws for some PT
 * series: renderToCanvasGPU reads `image.preScale.scaled` for every PT image,
 * while the DICOM loader only records `preScale` when it rescaled the pixels,
 * which it skips when the rescale is the identity (slope 1, intercept 0).
 *
 * So the image is loaded through the cache (a frame already loaded or loading
 * isn't fetched again) and a copy of it that always has `preScale` is
 * rendered, which also leaves the cached image as it is.
 */

import { imageLoader, metaData, utilities } from "@cornerstonejs/core";

/**
 * @param {HTMLCanvasElement} canvas drawn at its width and height
 * @param {string} imageId
 * @returns {Promise<void>} rejects if the image can't be loaded or drawn
 */
export async function renderImageToCanvas(canvas, imageId) {
  const image = await imageLoader.loadAndCacheImage(imageId);
  const { modality } = metaData.get("generalSeriesModule", imageId) ?? {};
  // Not rescaled is exactly what a missing preScale means.
  const renderable = {
    ...image,
    preScale: image.preScale ?? { scaled: false },
  };
  await utilities.renderToCanvasGPU(canvas, renderable, modality);
}
