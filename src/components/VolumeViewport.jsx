/**
 * Simple volume display panel. Assumes the volume has already
 * been created and loaded into the cache. Accepts volumeId as a prop
 **/
import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setOption } from "@/features/optionSlice";
import { attachDataFrame, removeMaskBox2D } from "@/lib/viewportFrame";
import {
  MARGIN_ZOOM,
  acquisitionPaneOrientation,
  refit3dViewportsAfterResize,
} from "@/lib/viewportView";
import ViewportLabel from "@/components/ViewportLabel";

import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { RenderingEngine, Enums, volumeLoader } from "@cornerstonejs/core";

import "./VolumeViewport.css";
import { re } from "mathjs";

import { eventTarget } from "@cornerstonejs/core";

const { Events } = Enums;

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

window.eventTarget = eventTarget;

// Badge text per pane orientation prop.
const PANE_LABELS = {
  AXIAL: "Axial",
  CORONAL: "Coronal",
  SAGITTAL: "Sagittal",
};

function VolumeViewport({
  viewportId,
  renderingEngine,
  voiSynchronizer,
  toolGroup,
  volumeId,
  orientation,
  segmentationId,
}) {
  const viewMode = useSelector((state) => state.options.view);
  const activeViewport = useSelector((state) => state.options.viewport);
  const [initialized, setInitialized] = useState(false);
  const dispatch = useDispatch();

  const elementRef = useRef(null);
  const frameDetachRef = useRef(null);
  const volumeLoadedListenerRef = useRef(null);

  window.re = renderingEngine;

  let realOrientation = Enums.OrientationAxis.ACQUISITION;
  if (orientation == "SAGITTAL") {
    realOrientation = Enums.OrientationAxis.SAGITTAL;
  }
  if (orientation == "AXIAL") {
    realOrientation = Enums.OrientationAxis.AXIAL;
  }
  if (orientation == "CORONAL") {
    realOrientation = Enums.OrientationAxis.CORONAL;
  }
  const segmentationIds = segmentation.state
    .getSegmentations()
    .map((seg) => seg.segmentationId);

  useEffect(() => {
    const wrapper = elementRef.current;
    if (!wrapper || !renderingEngine) return;

    function toggleViewportSize() {
      Array.from(wrapper.parentNode.children)
        .filter((child) => child !== wrapper)
        .forEach((child) => child.classList.toggle("minimized"));
      wrapper.classList.toggle("expanded");
      wrapper.parentElement.classList.toggle("expanded");

      renderingEngine.resize(true, true);
      renderingEngine.render();
      // The 3D pane comes back black after its sibling is minimized/restored
      // (degenerate camera on the shared context); re-fit it once layout settles.
      refit3dViewportsAfterResize(renderingEngine);
    }

    console.log("[VolumeViewport] adding dblclick listener to", wrapper);

    wrapper.addEventListener("dblclick", toggleViewportSize);
    return () => {
      wrapper.removeEventListener("dblclick", toggleViewportSize);
    };
  }, [renderingEngine]);

  useEffect(() => {
    // Rapid navigation can re-run this effect (or unmount the component)
    // while a previous setup run is still awaiting. That stale run must not
    // keep driving the viewport: its id has been disabled or re-enabled with
    // a new viewport object by then, and calls into the old one hit a
    // torn-down renderer ("Cannot read properties of null (reading
    // 'getViewUp')").
    let cancelled = false;

    const setup = async () => {
      // Remove any leftover minimized/expanded classes on volume change
      const wrapper = elementRef.current;
      if (wrapper && wrapper.parentNode) {
        Array.from(wrapper.parentNode.children).forEach((child) => {
          child.classList.remove("minimized", "expanded");
        });
        wrapper.classList.remove("minimized", "expanded");
        wrapper.parentElement.classList.remove("expanded");

        /* A hack to force-render a viewport */
        renderingEngine.resize(true, true);
        renderingEngine.render();
      }

      // elementRef.current.addEventListener(
      //   cornerstone.Enums.Events.VOLUME_LOADED,
      //   (evt) => {
      //   }
      // );

      const viewportInput = {
        viewportId,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: elementRef.current,
        defaultOptions: {
          orientation: realOrientation,
        },
      };

      renderingEngine.enableElement(viewportInput);

      voiSynchronizer.add({
        renderingEngineId: renderingEngine.id,
        viewportId,
      });

      // Get the volume viewport that was created
      const viewport = renderingEngine.getViewport(viewportId);

      // Add the mask segmentation's labelmap representation to this viewport and
      // activate it so the scissors can paint into it. Driven both by the
      // VolumeReallyLoaded event (fresh, async volume load) AND by the immediate
      // call below (cached load) — see that call's comment for why the event
      // alone isn't enough.
      const applyMaskSegmentation = (readySegmentationId) => {
        if (
          !readySegmentationId ||
          !segmentation.state.getSegmentation(readySegmentationId)
        ) {
          return;
        }
        // Hide the raw labelmap before adding the rep so only the clean overlay
        // box (drawn by MaskIEC) shows — doing it here, where the rep is added,
        // avoids a timing race with MaskIEC's effect.
        try {
          segmentation.config.style.setStyle(
            {
              segmentationId: readySegmentationId,
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
            },
            { renderFill: false, renderOutline: false },
          );
        } catch (error) {
          console.warn("[VolumeViewport] could not hide mask labelmap", error);
        }
        segmentation.addLabelmapRepresentationToViewport(viewportId, [
          { segmentationId: readySegmentationId },
        ]);
        // Activate it so the scissors can paint; the new segmentation isn't
        // auto-activated on navigation (see StackViewport for the same fix).
        segmentation.activeSegmentation.setActiveSegmentation(
          viewportId,
          readySegmentationId,
        );
        // Color the segment green so the scissors' in-progress draw rectangle
        // matches the selection box (it uses the segment color even though the
        // fill is hidden) — see StackViewport for the same fix.
        try {
          [1, 2].forEach((segmentIndex) =>
            segmentation.config.color.setSegmentIndexColor(
              viewportId,
              readySegmentationId,
              segmentIndex,
              [74, 222, 128, 255],
            ),
          );
        } catch (error) {
          console.warn("[VolumeViewport] could not color mask segment", error);
        }
        // The segmentation is now active on this viewport, so drawing is safe.
        // Signal the tools panel to enable the selection (scissors) tool, which
        // is kept disabled while loading to avoid a "No active segmentation"
        // error if the user draws too early.
        cornerstone.triggerEvent(eventTarget, "AllowSegmentationDrawing", {
          volumeId,
          segmentationId: readySegmentationId,
        });
      };

      const onVolumeReallyLoaded = (evt) =>
        applyMaskSegmentation(evt.detail?.segmentationId);
      // Drop a listener left by a previous mount before adding this one, so old
      // listeners can't fire against a now-disabled viewport and don't
      // accumulate across navigation.
      eventTarget.removeEventListener(
        "VolumeReallyLoaded",
        volumeLoadedListenerRef.current,
      );
      eventTarget.addEventListener("VolumeReallyLoaded", onVolumeReallyLoaded);
      volumeLoadedListenerRef.current = onVolumeReallyLoaded;

      toolGroup.addViewport(viewportId, renderingEngine.id);

      // Set the volume on the viewport and it's default properties
      viewport.setVolumes([{ volumeId }]);

      // Align this pane's anatomical camera to the volume's nearest voxel
      // axes: oblique acquisitions render square-on (so the selection box
      // tracks the cursor exactly) while each pane keeps its anatomical view
      // even when the voxel axes are permuted or flipped. Stored as the
      // viewport's orientation too, so every resetCamera() restores this
      // framing instead of the world-axis enum.
      const acqOrientation = acquisitionPaneOrientation(
        cornerstone.cache.getVolume(volumeId),
        orientation,
      );
      if (acqOrientation) {
        // Store the orientation on both slots Cornerstone reads during
        // camera resets: resetCamera() re-applies
        // viewportProperties.orientation (which setOrientation only fills
        // for string enums), and options.orientation feeds the other reset
        // paths. Without these, the next reset — e.g. the one inside the
        // labelmap addVolumes — snaps the camera back to the world axes.
        viewport.options.orientation = acqOrientation;
        viewport.viewportProperties.orientation = acqOrientation;
        viewport.setOrientation(acqOrientation);
      }

      // // Apply all active segmentations to the viewport
      const segmentationIds = segmentation.state
        .getSegmentations()
        .map((seg) => seg.segmentationId)
        .filter((segmentationId) => !segmentationId.startsWith("mask-"));

      await segmentation.addLabelmapRepresentationToViewportMap({
        [viewportId]: segmentationIds.map((segmentationId) => ({
          segmentationId,
        })),
      });

      // Superseded by a newer setup run (or unmounted) during the await.
      if (cancelled || renderingEngine.getViewport(viewportId) !== viewport) {
        return;
      }

      // Leave a margin around the image so its edges (and the data-boundary
      // frame) are visible inside the panel.
      viewport.setZoom(MARGIN_ZOOM, false);

      // Render the image
      viewport.render();

      // Draw the data-boundary frame (replacing any from a previous volume),
      // and clear any stale mask-box overlay left from a previous volume.
      frameDetachRef.current?.();
      frameDetachRef.current = attachDataFrame(viewport, elementRef.current);
      removeMaskBox2D(viewport);

      // On a cached revisit the volume is already loaded, so VolumeReallyLoaded
      // fired synchronously — inside MaskIEC's load, before this viewport was
      // mounted — and won't fire again. The segmentation already exists by now,
      // so apply it directly; without this the scissors has no active
      // segmentation after navigating away and back.
      applyMaskSegmentation(segmentationId);

      dispatch(setOption({ key: "viewport", value: viewportId }));

      setInitialized(true);
    };

    setup().catch((error) => {
      if (cancelled) {
        // The viewport was torn down mid-setup by navigation; the library
        // call it was awaiting failed against the dead viewport. Expected.
        console.log("[VolumeViewport] setup aborted by navigation", error);
        return;
      }
      throw error;
    });

    return () => {
      cancelled = true;
    };
  }, [elementRef, volumeId]);

  // Tear down the data-boundary frame and remove this viewport from the shared
  // rendering engine on unmount, so it doesn't linger and contaminate the next
  // route (the engine is reused across routes).
  useEffect(() => {
    return () => {
      frameDetachRef.current?.();
      frameDetachRef.current = null;
      eventTarget.removeEventListener(
        "VolumeReallyLoaded",
        volumeLoadedListenerRef.current,
      );
      volumeLoadedListenerRef.current = null;
      try {
        renderingEngine?.disableElement(viewportId);
      } catch (error) {
        console.warn("[VolumeViewport] disableElement failed", error);
      }
    };
  }, []);

  useEffect(() => {
    // Don't attempt to reset during initialization, as global
    // properites may not be set yet
    if (!initialized) return;

    const viewport = renderingEngine.getViewport(viewportId);
    const volume = cornerstone.cache.getVolume(volumeId);
    const volDimensions = volume.dimensions;

    if (viewMode === "projection") {
      const volSlab = Math.sqrt(
        volDimensions[0] * volDimensions[0] +
          volDimensions[1] * volDimensions[1] +
          volDimensions[2] * volDimensions[2],
      );

      viewport.setBlendMode(
        cornerstone.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
      );
      viewport.setSlabThickness(volSlab);
    } else if (viewMode === "volume") {
      console.log("Resetting viewport to default properties:", viewportId);
      viewport.resetProperties();
      viewport.resetToDefaultProperties();
    }

    // Reapply the margin: resetProperties above restores a full-fit zoom.
    viewport.setZoom(MARGIN_ZOOM, false);
    viewport.render();
  }, [viewMode]);

  return (
    <>
      <div
        id={viewportId}
        ref={elementRef}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDownCapture={() =>
          dispatch(setOption({ key: "viewport", value: viewportId }))
        }
        className={`volume-viewport viewport${
          activeViewport === viewportId ? " active" : ""
        }`}
      >
        <ViewportLabel text={PANE_LABELS[orientation] ?? orientation} />
      </div>
    </>
  );
}

export default VolumeViewport;
