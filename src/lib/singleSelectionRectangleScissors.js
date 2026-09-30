/**
 * RectangleScissorsTool that keeps a stack selection to a single rectangle.
 *
 * With the stock tool every rectangle is added to the labelmap, and accepting
 * a stack mask takes the bounding box of all of them (getCoordsForStackSeg).
 * Stray rectangles therefore silently grow the mask. Here a new rectangle
 * replaces the previous one instead: the stack's labelmap images are cleared
 * just before the stock tool fills the new rectangle.
 *
 * Volumes are left alone — their selection is turned into a 3D region by the
 * separate Expand step.
 */

import * as cornerstoneTools from "@cornerstonejs/tools";
import { cache, Enums, getEnabledElement } from "@cornerstonejs/core";

const { RectangleScissorsTool } = cornerstoneTools;

function clearStackSelectionBeforeFill(evt, editData) {
  const element = evt?.detail?.element;
  const segmentationId = editData?.segmentationId;
  if (!element || !segmentationId) {
    return;
  }
  if (editData.newAnnotation && !editData.hasMoved) {
    // A plain click fills nothing, so keep the existing selection.
    return;
  }

  const viewport = getEnabledElement(element)?.viewport;
  if (viewport?.type !== Enums.ViewportType.STACK) {
    return;
  }

  const labelmapImageIds =
    cornerstoneTools.segmentation.getLabelmapImageIds(segmentationId);
  labelmapImageIds?.forEach((imageId) => {
    cache.getImage(imageId)?.getPixelData()?.fill(0);
  });
}

export class SingleSelectionRectangleScissorsTool extends RectangleScissorsTool {
  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // _endCallback is an instance-property callback set by the base
    // constructor (it fills the rectangle on mouse-up), so we wrap it here,
    // after super, to clear the previous selection first.
    const originalEnd = this._endCallback;
    this._endCallback = (evt) => {
      clearStackSelectionBeforeFill(evt, this.editData);
      return originalEnd(evt);
    };
  }
}

// Register under the stock name so existing tool-group references keep working.
SingleSelectionRectangleScissorsTool.toolName = RectangleScissorsTool.toolName;
