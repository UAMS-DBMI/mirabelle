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
import { eventTarget, getEnabledElement } from "@cornerstonejs/core";

const { RectangleScissorsTool } = cornerstoneTools;

// Fired on every drag step of a fresh rectangle draw, carrying the IJK bounds
// of the rectangle drawn so far. The scissors tool itself only fills the
// labelmap (and so triggers SEGMENTATION_DATA_MODIFIED) on mouse-up, so
// without this the 3D box preview and the other 2D panes only update once the
// draw completes. Listeners merge this with any already-committed bounds.
export const MASK_LIVE_DRAW_EVENT = "mirabelle_maskLiveDraw";

// Fired once at mouse-down, when a stroke begins — before any drag step has
// produced bounds. MaskIEC uses it to un-hide a hidden selection box at the
// moment editing starts: visibility is back before the first drag pixel, so
// no part of the stroke is ever drawn blind and the box doesn't pop in
// mid-drag.
export const MASK_DRAW_START_EVENT = "mirabelle_maskDrawStart";

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

// Derive the IJK bounding box of the rectangle currently being dragged from
// its four world-space corner points and broadcast it. The two in-plane
// corners disagree on the two in-plane axes and agree (same slice) on the
// third, so a plain per-axis min/max needs no knowledge of which axes those
// are.
function broadcastLiveBounds(evt, editData) {
  const element = evt?.detail?.element;
  const points = editData?.annotation?.data?.handles?.points;
  const segmentationId = editData?.segmentationId;
  if (!element || !points || !segmentationId) {
    return;
  }

  const imageData = getEnabledElement(element)?.viewport?.getImageData()
    ?.imageData;
  if (!imageData) {
    return;
  }

  const ijkPoints = points.map((world) =>
    imageData.worldToIndex(world, [0, 0, 0]).map(Math.round),
  );
  const bounds = ["i", "j", "k"].reduce((acc, key, axis) => {
    const values = ijkPoints.map((p) => p[axis]);
    acc[key] = { min: Math.min(...values), max: Math.max(...values) };
    return acc;
  }, {});

  eventTarget.dispatchEvent(
    new CustomEvent(MASK_LIVE_DRAW_EVENT, {
      detail: { segmentationId, bounds },
    }),
  );
}

export class ClampedRectangleScissorsTool extends RectangleScissorsTool {
  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // These are instance-property callbacks set by the base constructor, so we
    // wrap them here (after super) to clamp the world point first.
    const originalPreMouseDown = this.preMouseDownCallback;
    this.preMouseDownCallback = (evt) => {
      clampWorldPointToVolume(evt);
      const result = originalPreMouseDown(evt);
      // After the stock callback: that is what builds editData, and the
      // announcement is useless without its segmentationId.
      const segmentationId = this.editData?.segmentationId;
      if (segmentationId) {
        eventTarget.dispatchEvent(
          new CustomEvent(MASK_DRAW_START_EVENT, {
            detail: { segmentationId },
          }),
        );
      }
      return result;
    };

    const originalDrag = this._dragCallback;
    this._dragCallback = (evt) => {
      clampWorldPointToVolume(evt);
      const result = originalDrag(evt);
      broadcastLiveBounds(evt, this.editData);
      return result;
    };
  }
}

// Register under the stock name so existing tool-group references keep working.
ClampedRectangleScissorsTool.toolName = RectangleScissorsTool.toolName;
