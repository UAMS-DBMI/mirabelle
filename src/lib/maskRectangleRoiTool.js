/**
 * MaskRectangleRoiTool — a RectangleROITool tuned for the volume mask selection.
 *
 * Cornerstone's stock RectangleROITool draws an unfilled, 1px outline and only
 * grabs the box when you click near its border. The mask selection wants
 * something more prominent and forgiving:
 *
 *   - a translucent green fill so the selection reads as a solid region,
 *   - thicker green edges (set via the annotation's lineWidth style), and
 *   - click-anywhere-inside to move the whole box (not just on the border).
 *
 * The stock tool assigns `renderAnnotation` and `isPointNearTool` as instance
 * properties in its constructor, so a prototype override would be shadowed. We
 * therefore wrap them here, in our constructor, after super() has installed the
 * originals: the fill is drawn behind the stock outline, and interior points are
 * treated as "near the tool" so a drag on the fill moves the box.
 */

import { getEnabledElement } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

const { RectangleROITool, annotation, drawing } = cornerstoneTools;
const { getAnnotations } = annotation.state;
const { isAnnotationVisible } = annotation.visibility;
const { setAttributesIfNecessary, setNewAttributesIfValid } = drawing;

const SVGNS = "http://www.w3.org/2000/svg";

// Green selection theme, shared across the ROI's normal / hover / selected
// states, with a thick edge and a light translucent fill.
const ROI_GREEN = "rgb(74, 222, 128)";
const ROI_FILL = "rgb(74, 222, 128)";
const ROI_FILL_OPACITY = "0.18";
const ROI_LINE_WIDTH = "3";

/** Per-annotation style to apply after creating a mask ROI (see the controller). */
export const MASK_ROI_STYLE = {
  color: ROI_GREEN,
  colorHighlighted: ROI_GREEN,
  colorSelected: ROI_GREEN,
  lineWidth: ROI_LINE_WIDTH,
};

// Drop the ROI's area/stats text box — we only want the resizable rectangle.
export const MASK_ROI_TOOL_CONFIG = { calculateStats: false };

export class MaskRectangleRoiTool extends RectangleROITool {
  static toolName = "MaskRectangleRoi";

  constructor(props = {}) {
    super(props);

    // Draw the fill behind the stock outline, then let the parent render the
    // outline/handles/text on top.
    const renderOutline = this.renderAnnotation;
    this.renderAnnotation = (enabledElement, svgDrawingHelper) => {
      this._renderFill(enabledElement, svgDrawingHelper);
      return renderOutline(enabledElement, svgDrawingHelper);
    };

    // Grab the box from anywhere inside it (so dragging the fill moves it), in
    // addition to the parent's border-proximity test (which also drives the
    // resize handles).
    const nearBorder = this.isPointNearTool;
    this.isPointNearTool = (element, ann, canvasCoords, proximity) => {
      if (nearBorder(element, ann, canvasCoords, proximity)) return true;
      return this._isPointInside(element, ann, canvasCoords);
    };

    // One box per pane: once a rectangle exists on this viewport's plane, a
    // click on empty space must not start another — the existing box is moved or
    // resized instead (that path goes through the parent's select/handle
    // callbacks, not here). Returning the existing annotation keeps the caller
    // (mouseDownActivate) happy without drawing anything new.
    const drawNew = this.addNewAnnotation;
    this.addNewAnnotation = (evt, interactionType) => {
      const existing = this._existingAnnotationForEvent(evt);
      if (existing) return existing;
      return drawNew(evt, interactionType);
    };
  }

  // The mask ROI already present on this event's viewport plane, if any.
  // Annotations are frame-of-reference scoped (shared across the ortho panes),
  // so match by view-plane normal to find the one belonging to this pane.
  _existingAnnotationForEvent(evt) {
    const { element } = evt.detail ?? {};
    const { viewport } = getEnabledElement(element) ?? {};
    if (!viewport) return null;
    const normal = viewport.getCamera().viewPlaneNormal;
    const annotations = getAnnotations(this.getToolName(), element) ?? [];
    return (
      annotations.find((ann) => {
        const n = ann?.metadata?.viewPlaneNormal;
        return (
          n &&
          Math.abs(n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2]) > 0.99
        );
      }) ?? null
    );
  }

  // The rectangle's opposite corners are points[0] and points[3] (matching the
  // parent's own hit-test); a point is inside when it's within that AABB.
  _isPointInside(element, ann, canvasCoords) {
    const { viewport } = getEnabledElement(element) ?? {};
    const points = ann?.data?.handles?.points;
    if (!viewport || points?.length < 4) return false;
    const c0 = viewport.worldToCanvas(points[0]);
    const c3 = viewport.worldToCanvas(points[3]);
    const [x, y] = canvasCoords;
    return (
      x >= Math.min(c0[0], c3[0]) &&
      x <= Math.max(c0[0], c3[0]) &&
      y >= Math.min(c0[1], c3[1]) &&
      y <= Math.max(c0[1], c3[1])
    );
  }

  // Paint a translucent filled rect for every on-plane, visible annotation.
  // Mirrors the parent's annotation filtering so fills line up with outlines.
  _renderFill(enabledElement, svgDrawingHelper) {
    const { viewport } = enabledElement;
    const { element } = viewport;
    let annotations = getAnnotations(this.getToolName(), element);
    if (!annotations?.length) return;
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations,
    );
    if (!annotations?.length) return;

    annotations.forEach((ann) => {
      const { annotationUID } = ann;
      const points = ann?.data?.handles?.points;
      if (!isAnnotationVisible(annotationUID) || points?.length < 4) return;
      const canvasCoords = points.map((p) => viewport.worldToCanvas(p));
      this._drawFilledRect(svgDrawingHelper, annotationUID, canvasCoords);
    });
  }

  // A filled <rect> keyed under a "fill" node UID so it never collides with the
  // parent's stroked rect ("0"). Kept in sync with the annotation each render.
  _drawFilledRect(svgDrawingHelper, annotationUID, canvasCoordinates) {
    const svgNodeHash = `${annotationUID}::rect::fill`;
    const [topLeft, topRight, bottomLeft, bottomRight] = canvasCoordinates;
    const width = Math.hypot(
      topLeft[0] - topRight[0],
      topLeft[1] - topRight[1],
    );
    const height = Math.hypot(
      topLeft[0] - bottomLeft[0],
      topLeft[1] - bottomLeft[1],
    );
    const center = [
      (bottomRight[0] + topLeft[0]) / 2,
      (bottomRight[1] + topLeft[1]) / 2,
    ];
    const leftEdgeCenter = [
      (bottomLeft[0] + topLeft[0]) / 2,
      (bottomLeft[1] + topLeft[1]) / 2,
    ];
    const angle =
      (Math.atan2(center[1] - leftEdgeCenter[1], center[0] - leftEdgeCenter[0]) *
        180) /
      Math.PI;
    const attributes = {
      x: `${center[0] - width / 2}`,
      y: `${center[1] - height / 2}`,
      width: `${width}`,
      height: `${height}`,
      fill: ROI_FILL,
      "fill-opacity": ROI_FILL_OPACITY,
      stroke: "none",
      transform: `rotate(${angle} ${center[0]} ${center[1]})`,
    };

    const existing = svgDrawingHelper.getSvgNode(svgNodeHash);
    if (existing) {
      setAttributesIfNecessary(attributes, existing);
      svgDrawingHelper.setNodeTouched(svgNodeHash);
    } else {
      const node = document.createElementNS(SVGNS, "rect");
      setNewAttributesIfValid(attributes, node);
      svgDrawingHelper.appendNode(node, svgNodeHash);
    }
  }
}

export const MASK_ROI_TOOL_NAME = MaskRectangleRoiTool.toolName;
