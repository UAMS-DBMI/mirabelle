/**
 * The window a NIfTI volume shows in each view mode.
 *
 * A NIfTI file has no window, so its slices use the middle slice's range, found
 * while the file loads (niftiLoadingWindow). A change of view mode has to set
 * it again:
 *
 * - Cornerstone's resetProperties() goes back to the window the viewport mounted
 *   with, here a placeholder or the first slices' range, so everything above it
 *   clips to white.
 * - MIP shows the brightest voxel along each ray, which can be far above the
 *   middle slice's range, so it gets a window from the values it shows instead.
 */

import { cache } from "@cornerstonejs/core";
import { windowInMetadata } from "./niftiLoadingWindow";

// Projected values below and above these shares clip to black and white, so a
// few stray voxels don't flatten the rest of the image.
const LOWER_PERCENTILE = 0.01;
const UPPER_PERCENTILE = 0.999;

// Roughly how many voxels to read for a projection; larger volumes skip slices.
const MAX_SCANNED_VOXELS = 20_000_000;

/**
 * @param {object} volume The volume in the viewport.
 * @param {string} viewMode "volume", "projection" (MIP) or "min_projection" (MinIP).
 * @returns {{lower: number, upper: number} | null} null leaves the window as it
 *   is: not a NIfTI volume, or nothing to base a window on yet.
 */
export function niftiViewWindow(volume, viewMode) {
  const { imageIds } = volume;
  if (!imageIds?.[0]?.startsWith("nifti:")) return null;
  if (viewMode === "projection") return projectedValuesWindow(imageIds);
  return windowInMetadata(imageIds[Math.floor(imageIds.length / 2)]);
}

function projectedValuesWindow(imageIds) {
  const images = imageIds
    .map((imageId) => cache.getImage(imageId))
    .filter(Boolean);
  if (!images.length) return null;
  const values = projectedValues(images).sort();
  const lower = values[Math.floor(values.length * LOWER_PERCENTILE)];
  const upper = values[Math.floor(values.length * UPPER_PERCENTILE)];
  return upper > lower ? { lower, upper } : null;
}

// The brightest value along each ray through the slices, leaving out rays that
// only cross empty space.
function projectedValues(images) {
  const sliceVoxels = images[0].getPixelData().length;
  const sliceStep = Math.ceil(
    (images.length * sliceVoxels) / MAX_SCANNED_VOXELS,
  );
  const brightest = new Float64Array(sliceVoxels).fill(-Infinity);
  for (let slice = 0; slice < images.length; slice += sliceStep) {
    const pixels = images[slice].getPixelData();
    for (let i = 0; i < sliceVoxels; i++) {
      if (pixels[i] > brightest[i]) brightest[i] = pixels[i];
    }
  }
  return brightest.filter((value) => value !== 0 && Number.isFinite(value));
}
