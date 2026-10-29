/**
 * Wrapper around @cornerstonejs/polymorphic-segmentation that prevents a
 * known crash in its updateSurfaceData.
 *
 * When the labelmap changes, updateSurfaceData rebuilds the 3D surface.
 * For a segment with no cached surface geometry yet (a selection drawn
 * after Expand), it tries to create that geometry once per viewport
 * holding the segmentation — including the 2D viewports, which have no
 * Surface representation — and crashes dereferencing it:
 *
 *   TypeError: Cannot read properties of undefined (reading 'segmentationId')
 *
 * The fix: skip the update whenever such a segment exists (or the
 * segmentation itself was removed, e.g. by Clear Selection). This is
 * harmless — drawn selections are not shown in 3D anyway, and the next
 * Expand absorbs them into the expanded segment, which has geometry, so
 * the update then runs normally.
 *
 * Register this object (not the raw package) as the polySeg addon in
 * cornerstoneTools.init — see EnableCornerstone.
 */

import * as polySeg from "@cornerstonejs/polymorphic-segmentation";
import { cache } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

const { getSegmentation } = cornerstoneTools.segmentation.state;
const { getUniqueSegmentIndices } = cornerstoneTools.utilities.segmentation;

function canUpdateSurfaces(segmentationId) {
  if (!getSegmentation(segmentationId)) {
    return false;
  }
  return getUniqueSegmentIndices(segmentationId).every((segmentIndex) =>
    cache.getGeometry(`segmentation_${segmentationId}_surface_${segmentIndex}`),
  );
}

async function updateSurfaceData(segmentationId, options) {
  if (!canUpdateSurfaces(segmentationId)) {
    return;
  }
  return polySeg.updateSurfaceData(segmentationId, options);
}

export const safePolySeg = {
  ...polySeg,
  updateSurfaceData,
};

export default safePolySeg;
