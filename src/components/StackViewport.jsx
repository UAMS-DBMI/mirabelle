/**
 * Simple stack display panel.
 **/
import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core";
import LoadingSpinner from "@/components/LoadingSpinner";
import { attachDataFrame } from "@/lib/viewportFrame";
import { setOption } from "@/features/optionSlice";
import ViewportLabel from "@/components/ViewportLabel";

import "./StackViewport.css";

// Zoom out a touch so the image doesn't touch the panel edge — keeps the
// selection box and the data-boundary frame visible. Matches VolumeViewport.
const MARGIN_ZOOM = 0.92;

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  PlanarRotateTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { segmentation: segmentationUtils } = cstUtils;

const { ViewportType } = Enums;

function StackViewport({
  frames,
  mip,
  viewportId,
  renderingEngine,
  toolGroup,
  segmentationId,
  onImageChange,
}) {
  console.log("[StackViewport] rendering");
  const elementRef = useRef(null);
  const frameDetachRef = useRef(null);
  const segReadyListenerRef = useRef(null);

  const [initialized, setInitialized] = useState(false);
  const dispatch = useDispatch();
  const activeViewport = useSelector((state) => state.options.viewport);

  useEffect(() => {
    const setup = async () => {
      if (frames === undefined) {
        return;
      }
      console.log("[StackViewport] setup running");

      // Listen to some events from the viewport
      elementRef.current.addEventListener(
        cornerstone.Enums.Events.STACK_NEW_IMAGE,
        (evt) => {
          if (onImageChange) {
            onImageChange(evt.detail.image.imageId);
          }
        },
      );

      const viewportInput = {
        viewportId,
        type: Enums.ViewportType.STACK,
        element: elementRef.current,
      };

      renderingEngine.enableElement(viewportInput);

      // Get the stack viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);

      toolGroup.addViewport(viewportId, renderingEngine.id);

      // Add the labelmap representation when BOTH the segmentation exists
      // (loadStackSegmentation fires "StackSegmentationReady") AND the stack
      // image is set (otherwise the labelmap mapper reads a null and throws).
      // `imageReady` and `repAdded` make this work for every timing: the event
      // can fire before this listener is attached (cached images, handled by
      // the post-setStack check) or after (navigation, handled by the
      // listener). We register the listener BEFORE setStack so we never miss it.
      let imageReady = false;
      let repAdded = false;
      const addRepWhenReady = (readySegmentationId) => {
        if (
          !readySegmentationId ||
          !imageReady ||
          repAdded ||
          !segmentation.state.getSegmentation(readySegmentationId)
        ) {
          return;
        }
        repAdded = true;

        // Add the representation FIRST, then style it. setSegmentIndexColor
        // throws if there's no representation yet (getSegmentIndexColor returns
        // null), and setStyle only takes effect on a render — so styling before
        // the rep exists would silently bail and leave the default white fill /
        // red outline.
        segmentation.addLabelmapRepresentationToViewport(viewportId, [
          { segmentationId: readySegmentationId },
        ]);
        // Activate it so the scissors can paint into it (it isn't
        // auto-activated, so without this drawing throws "No active
        // segmentation detected").
        segmentation.activeSegmentation.setActiveSegmentation(
          viewportId,
          readySegmentationId,
        );
        // The segmentation is now active on this viewport, so drawing is safe.
        // Signal the tools panel to enable the selection (scissors) tool, which
        // is kept disabled while loading to avoid a "No active segmentation"
        // error if the user draws too early.
        cornerstone.triggerEvent(
          cornerstone.eventTarget,
          "AllowSegmentationDrawing",
          { segmentationId: readySegmentationId },
        );

        // Hide the raw labelmap (fill + outline) — only the clean overlay box
        // (drawn by MaskIEC) shows — and color the segment green so the
        // scissors' draw rectangle matches the selection box (it uses the
        // segment color even though the fill is hidden).
        try {
          segmentation.config.style.setStyle(
            {
              segmentationId: readySegmentationId,
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
            },
            { renderFill: false, renderOutline: false },
          );
          [1, 2].forEach((segmentIndex) =>
            segmentation.config.color.setSegmentIndexColor(
              viewportId,
              readySegmentationId,
              segmentIndex,
              [74, 222, 128, 255],
            ),
          );
        } catch (error) {
          console.warn("[StackViewport] could not style mask segment", error);
        }
        // Force the style/color changes to render now.
        viewport.render();
      };

      const onSegmentationReady = (evt) =>
        addRepWhenReady(evt.detail?.segmentationId);
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        segReadyListenerRef.current,
      );
      cornerstone.eventTarget.addEventListener(
        "StackSegmentationReady",
        onSegmentationReady,
      );
      segReadyListenerRef.current = onSegmentationReady;

      await viewport.setStack(frames);

      // Leave a margin around the image so its edges (and the data-boundary
      // frame) are visible inside the panel.
      viewport.setZoom(MARGIN_ZOOM, false);

      // Render the image
      viewport.render();
      window.viewport = viewport;

      // Image is ready now — add the rep if the segmentation already exists
      // (event fired during setStack); otherwise the listener adds it on fire.
      imageReady = true;
      addRepWhenReady(segmentationId);

      // Draw the data-boundary frame (replacing any from a previous image).
      frameDetachRef.current?.();
      frameDetachRef.current = attachDataFrame(viewport, elementRef.current);

      setInitialized(true);
    };

    setup();
  }, [elementRef, frames]);

  // Tear down the data-boundary frame, the segmentation-ready listener, and the
  // viewport itself on unmount, so nothing lingers in the shared rendering
  // engine across routes.
  useEffect(() => {
    return () => {
      frameDetachRef.current?.();
      frameDetachRef.current = null;
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        segReadyListenerRef.current,
      );
      segReadyListenerRef.current = null;
      try {
        renderingEngine?.disableElement(viewportId);
      } catch (error) {
        console.warn("[StackViewport] disableElement failed", error);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={elementRef}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDownCapture={() =>
          dispatch(setOption({ key: "viewport", value: viewportId }))
        }
        className={`stack-viewport viewport${
          activeViewport === viewportId ? " active" : ""
        }`}
      >
        <ViewportLabel text="Stack" />
      </div>
    </>
  );
}

export default StackViewport;
