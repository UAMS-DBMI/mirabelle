/**
 * RectangleScissorsTool that can't draw outside the image.
 *
 * The stock tool follows the mouse anywhere on the canvas, so a drag past the
 * image lets the selection extend beyond the data — its edges then sit outside
 * the viewport and can't be seen. We clamp the drawn corners to the volume's
 * voxel range so the rectangle always stays inside the drawing limits.
 *
 * The clamp is applied by mutating the event's world point before the stock
 * mouse-down / drag callbacks consume it; those callbacks derive the rectangle
 * from that point, so clamping it constrains the whole rectangle.
 */

import * as cornerstoneTools from "@cornerstonejs/tools";
import { getEnabledElement } from "@cornerstonejs/core";

const { RectangleScissorsTool } = cornerstoneTools;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Clamp the event's world point into the volume's voxel-center range. We clamp
// in index space so it works for oriented volumes, then map back to world.
function clampWorldPointToVolume(evt) {
  const detail = evt?.detail;
  const element = detail?.element;
  const world = detail?.currentPoints?.world;
  if (!element || !world) {
    return;
  }

  const imageData = getEnabledElement(element)?.viewport?.getImageData()
    ?.imageData;
  if (!imageData) {
    return;
  }

  const [iSize, jSize, kSize] = imageData.getDimensions();
  const ijk = imageData.worldToIndex(world, [0, 0, 0]);
  ijk[0] = clamp(ijk[0], 0, iSize - 1);
  ijk[1] = clamp(ijk[1], 0, jSize - 1);
  ijk[2] = clamp(ijk[2], 0, kSize - 1);

  const clamped = imageData.indexToWorld(ijk, [0, 0, 0]);
  world[0] = clamped[0];
  world[1] = clamped[1];
  world[2] = clamped[2];
}

export class ClampedRectangleScissorsTool extends RectangleScissorsTool {
  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // These are instance-property callbacks set by the base constructor, so we
    // wrap them here (after super) to clamp the world point first.
    const originalPreMouseDown = this.preMouseDownCallback;
    this.preMouseDownCallback = (evt) => {
      clampWorldPointToVolume(evt);
      return originalPreMouseDown(evt);
    };

    const originalDrag = this._dragCallback;
    this._dragCallback = (evt) => {
      clampWorldPointToVolume(evt);
      return originalDrag(evt);
    };
  }
}

// Register under the stock name so existing tool-group references keep working.
ClampedRectangleScissorsTool.toolName = RectangleScissorsTool.toolName;
