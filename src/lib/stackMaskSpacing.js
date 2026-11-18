/**
 * Millimetres per pixel for a stack image's mask box: the scale that turns the
 * drawn pixel box into the numbers Posda's masker receives, and the stored
 * numbers back into pixels.
 *
 * It has to be the scale the masker divides by, or the blackout lands somewhere
 * else. The masker's source is private, so the rule is what it was measured
 * doing on two mammograms (the changed pixels of the masked file against the
 * stored box):
 *
 *   - Pixel Spacing 0.0389, Imager Pixel Spacing 0.070 (a magnification view):
 *     the blackout sat at box / 0.070. This app had sent box × 0.0389, so it
 *     missed the text it was drawn over.
 *   - both 0.070: the blackout sat at box / 0.070, where it was drawn.
 *
 * So when a header has both, Imager Pixel Spacing is used. A header with only
 * Imager Pixel Spacing keeps sending pixels (spacing 1), as it always has:
 * what the masker does with those hasn't been measured.
 */
import * as cornerstone from "@cornerstonejs/core";

const IMAGER_PIXEL_SPACING = "x00181164";

// The file header of the image, or of the image a labelmap was drawn over.
function headerOf(image) {
  if (image.data?.elements) return image.data;
  const source = image.referencedImageId
    ? cornerstone.cache.getImage(image.referencedImageId)
    : null;
  return source?.data?.elements ? source.data : null;
}

// [column spacing, row spacing], or null when the header has no usable value.
function imagerPixelSpacingOf(image) {
  const header = headerOf(image);
  if (!header) return null;
  // DICOM lists the row spacing first.
  const rowSpacing = header.floatString(IMAGER_PIXEL_SPACING, 0);
  const columnSpacing = header.floatString(IMAGER_PIXEL_SPACING, 1);
  return rowSpacing > 0 && columnSpacing > 0
    ? [columnSpacing, rowSpacing]
    : null;
}

/**
 * @param {object} image A loaded stack image, or its labelmap image.
 * @returns {number[]} Spacing along i (columns), j (rows) and k (slices).
 */
export function stackMaskSpacing(image) {
  const hasPixelSpacing =
    image.columnPixelSpacing != null && image.rowPixelSpacing != null;
  const imagerSpacing = hasPixelSpacing ? imagerPixelSpacingOf(image) : null;
  const [columnSpacing, rowSpacing] = imagerSpacing ?? [
    image.columnPixelSpacing ?? 1,
    image.rowPixelSpacing ?? 1,
  ];
  return [columnSpacing, rowSpacing, 1];
}
