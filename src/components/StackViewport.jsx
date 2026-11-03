/**
 * Simple stack display panel.
 **/
import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHotkeys } from "react-hotkeys-hook";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core";
import LoadingSpinner from "@/components/LoadingSpinner";
import { attachDataFrame } from "@/lib/viewportFrame";
import { attachFramePreview } from "@/lib/stackFramePreview";
import { attachSliceScrollbar, attachSliceCounter } from "@/lib/sliceScrollbar";
import { setOption } from "@/features/optionSlice";
import ViewportLabel from "@/components/ViewportLabel";

import "./StackViewport.css";

// Zoom out a touch so the image doesn't touch the panel edge — keeps the
// selection box and the data-boundary frame visible. Matches VolumeViewport.
const MARGIN_ZOOM = 0.92;

// Slices PageUp / PageDown step through at a time.
const PAGE_STEP = 10;

// The slice keys also scroll whichever panel has focus unless prevented.
const SLICE_KEY_OPTIONS = { preventDefault: true };

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
  onViewportReady,
}) {
  console.log("[StackViewport] rendering");
  const elementRef = useRef(null);
  const frameDetachRef = useRef(null);
  const previewDetachRef = useRef(null);
  const scrollbarDetachRef = useRef(null);
  const counterDetachRef = useRef(null);
  const segReadyListenerRef = useRef(null);
  // The viewport once its stack is set, for the slice keys.
  const viewportRef = useRef(null);

  const [initialized, setInitialized] = useState(false);
  const dispatch = useDispatch();
  const activeViewport = useSelector((state) => state.options.viewport);

  // Up/Down step one slice, PageUp/PageDown ten, Home/End go to the first and
  // last (scroll() clamps at the ends, so a step the stack's length lands
  // there). Left/Right stay IEC navigation. useHotkeys memoizes its callbacks
  // on the first render, so they reach the viewport through the ref.
  const stepSlices = (delta) => viewportRef.current?.scroll(delta);
  const stepToEnd = (direction) => {
    const viewport = viewportRef.current;
    viewport?.scroll(direction * viewport.getImageIds().length);
  };
  useHotkeys("up", () => stepSlices(-1), SLICE_KEY_OPTIONS);
  useHotkeys("down", () => stepSlices(1), SLICE_KEY_OPTIONS);
  useHotkeys("pageup", () => stepSlices(-PAGE_STEP), SLICE_KEY_OPTIONS);
  useHotkeys("pagedown", () => stepSlices(PAGE_STEP), SLICE_KEY_OPTIONS);
  useHotkeys("home", () => stepToEnd(-1), SLICE_KEY_OPTIONS);
  useHotkeys("end", () => stepToEnd(1), SLICE_KEY_OPTIONS);

  useEffect(() => {
    // Navigation can supersede this setup while it awaits setStack. Past that
    // point the viewport it captured has been disabled, and driving it hits a
    // torn-down renderer ("Cannot read properties of null (reading
    // 'getViewUp')") — an escaping rejection the user sees as an error toast.
    // Same guard as VolumeViewport.
    let cancelled = false;
    // True once this run no longer owns the viewport it set up.
    const superseded = (viewport) =>
      cancelled || renderingEngine.getViewport(viewportId) !== viewport;

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

      // Draw each frame as its file arrives, from the first one setStack
      // asks for, where it will appear once the margin zoom below is set.
      previewDetachRef.current?.();
      previewDetachRef.current = attachFramePreview(
        viewport,
        elementRef.current,
        { initialZoom: MARGIN_ZOOM },
      );

      await viewport.setStack(frames);

      if (superseded(viewport)) return;

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
      // Same slice scrollbar as the volume panes (replacing any from a
      // previous stack).
      scrollbarDetachRef.current?.();
      scrollbarDetachRef.current = attachSliceScrollbar(
        viewport,
        elementRef.current,
      );
      // "N / total" in the corner; the scrollbar only shows it on hover.
      counterDetachRef.current?.();
      counterDetachRef.current = attachSliceCounter(
        viewport,
        elementRef.current,
      );

      viewportRef.current = viewport;
      onViewportReady?.(viewport);

      setInitialized(true);
    };

    setup().catch((error) => {
      if (cancelled) {
        // Torn down mid-setup by navigation; the library call it was awaiting
        // failed against the dead viewport. Expected — don't toast it.
        console.log("[StackViewport] setup aborted by navigation", error);
        return;
      }
      throw error;
    });

    return () => {
      cancelled = true;
    };
  }, [elementRef, frames]);

  // Tear down the data-boundary frame, the segmentation-ready listener, and the
  // viewport itself on unmount, so nothing lingers in the shared rendering
  // engine across routes.
  useEffect(() => {
    return () => {
      frameDetachRef.current?.();
      frameDetachRef.current = null;
      previewDetachRef.current?.();
      previewDetachRef.current = null;
      scrollbarDetachRef.current?.();
      scrollbarDetachRef.current = null;
      counterDetachRef.current?.();
      counterDetachRef.current = null;
      viewportRef.current = null;
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
