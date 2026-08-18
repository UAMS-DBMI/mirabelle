/**
 * The previously submitted mask's overlay (the amber box), as one hook shared
 * by the routes that show it: the mask route (drawn alongside the green
 * selection box) and the mask review route (drawn over the already-masked
 * images the reviewer is judging — the box says where the mask that produced
 * them sits).
 *
 * The host route supplies its load state; the hook owns everything else:
 * resolving the stored `masking_parameters` against the loaded geometry,
 * publishing `prevMaskAvailable` (which the panel's control gates on), drawing
 * and tearing down the 3D/2D overlays, and restyling them in place as the
 * Submitted Mask Opacity slider moves. Both routes render the same viewport
 * components, so the viewport-id conventions here cover both.
 */

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import * as cornerstone from "@cornerstonejs/core";

import { setOption } from "@/features/optionSlice";
import {
  addPreviousMaskBox,
  removePreviousMaskBox,
  setPreviousMaskBoxStyle,
  PREVIOUS_EDGE_COLOR,
  PREVIOUS_FILL_COLOR,
} from "@/lib/maskBox";
import { maskingParametersToBounds } from "@/lib/maskingParameters";
import {
  addPreviousMaskBox2D,
  removePreviousMaskBox2D,
} from "@/lib/viewportFrame";

// Which pane a viewport id belongs to, for the box overlays. Shared by the
// mask and mask-review routes, which render the same viewport components.
export const is3dViewport = (id) => id.startsWith("coronal3d");
// 2D mask viewports: the volume orthographic panes and the stack pane.
export const is2dViewport = (id) => id.endsWith("2d") || id === "myviewport";

// A colour triple (0-1 per channel) as a CSS rgba() string.
const asCss = (color, alpha) =>
  `rgba(${color.map((channel) => Math.round(channel * 255)).join(", ")}, ${alpha})`;

// Style for the previous mask's box — amber so it can't be mistaken for the
// live selection. Same structure as MaskIEC's SELECTION_BOX_STYLE.
const PREVIOUS_BOX_STYLE = {
  box2d: {
    borderColor: asCss(PREVIOUS_EDGE_COLOR, 0.95),
    fillColor: PREVIOUS_EDGE_COLOR,
    fillAlpha: 0.18,
  },
  box3d: {
    color: PREVIOUS_EDGE_COLOR,
    width: 1,
    fillColor: PREVIOUS_FILL_COLOR,
    fillAlpha: 0.15,
  },
};

// Geometry of whatever is loaded, for turning the stored masking parameters
// (millimetres) back into index bounds. spacing/dimensions mirror what
// handleAccept submits with, so this app's own submissions round-trip exactly;
// worldToIndex/worldBoundsMin are the full patient→index transform (origin and
// direction included) for the pipeline's corner-relative parameters — see
// maskingParametersToBounds for how the readings are tried.
function loadedVolumeGeometry(volumeId) {
  const volume = cornerstone.cache.getVolume(volumeId);
  if (!volume) return null;
  const imageData = volume.imageData;
  // getBounds() is the volume's patient-space AABB (direction applied):
  // [xmin, xmax, ymin, ymax, zmin, zmax]. Its min corner is the origin the
  // pipeline's corner-relative masks are measured from.
  const bounds =
    typeof imageData?.getBounds === "function" ? imageData.getBounds() : null;
  return {
    spacing: volume.spacing,
    dimensions: volume.dimensions,
    worldToIndex:
      typeof imageData?.worldToIndex === "function"
        ? (world) => imageData.worldToIndex(world, [0, 0, 0])
        : undefined,
    worldBoundsMin: bounds ? [bounds[0], bounds[2], bounds[4]] : undefined,
  };
}

// The stack has no vtk imageData to lean on, so its patient-space geometry is
// built from DICOM plane metadata: i/j are signed distances along the row/
// column direction cosines, k the distance along the plane normal in slice
// steps, and the bounding-box corner is the min over the frames' image-rect
// corners. Any missing piece just omits the world pieces — the index-relative
// reading still works without them.
function stackWorldGeometry(imageIds, spacing, dimensions) {
  const plane = cornerstone.metaData.get("imagePlaneModule", imageIds[0]);
  const origin = plane?.imagePositionPatient;
  // rowCosines run along a row (increasing column index i); columnCosines down
  // a column (increasing row index j).
  const rowDir = plane?.rowCosines;
  const colDir = plane?.columnCosines;
  if (!origin || !rowDir || !colDir) return {};
  const normal = [
    rowDir[1] * colDir[2] - rowDir[2] * colDir[1],
    rowDir[2] * colDir[0] - rowDir[0] * colDir[2],
    rowDir[0] * colDir[1] - rowDir[1] * colDir[0],
  ];
  // Slice step from the first two frames' positions; a single-frame stack
  // keeps 1mm, which only matters for how tolerant the "does the box reach
  // this plane" test is along the normal.
  let sliceStep = 1;
  const secondOrigin =
    imageIds.length > 1
      ? cornerstone.metaData.get("imagePlaneModule", imageIds[1])
          ?.imagePositionPatient
      : null;
  if (secondOrigin) {
    const step = Math.hypot(
      secondOrigin[0] - origin[0],
      secondOrigin[1] - origin[1],
      secondOrigin[2] - origin[2],
    );
    if (step > 0) sliceStep = step;
  }

  // Patient-space min corner over the frame rect's corners (first and last
  // frame, so the slice extent is covered too).
  const rectOrigins = [origin];
  if (imageIds.length > 1) {
    const last = cornerstone.metaData.get(
      "imagePlaneModule",
      imageIds[imageIds.length - 1],
    )?.imagePositionPatient;
    if (last) rectOrigins.push(last);
  }
  const worldBoundsMin = [Infinity, Infinity, Infinity];
  rectOrigins.forEach((o) => {
    for (let cx = 0; cx <= 1; cx += 1) {
      for (let cy = 0; cy <= 1; cy += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          const corner =
            o[axis] +
            rowDir[axis] * cx * dimensions[0] * spacing[0] +
            colDir[axis] * cy * dimensions[1] * spacing[1];
          worldBoundsMin[axis] = Math.min(worldBoundsMin[axis], corner);
        }
      }
    }
  });

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return {
    worldBoundsMin,
    worldToIndex: (world) => {
      const rel = [
        world[0] - origin[0],
        world[1] - origin[1],
        world[2] - origin[2],
      ];
      return [
        dot(rel, rowDir) / (spacing[0] || 1),
        dot(rel, colDir) / (spacing[1] || 1),
        dot(rel, normal) / sliceStep,
      ];
    },
  };
}

// `justLoadedImage` covers a hole in the cache lookup: IMAGE_LOADED is
// dispatched from a .then attached to the load promise BEFORE the one that
// stores the image in the cache (imageLoader.js handleImageLoadPromise vs
// cache.putImageLoadObject), so a listener running on that event sees
// cache.getImage() miss for the very image the event announces. A multi-image
// stack recovers on the next frame's event; a single-image stack (every DX)
// never gets one — so the retry passes the event's own image through here.
function loadedStackGeometry(imageIds, justLoadedImage) {
  const firstImageId = imageIds?.length ? imageIds[0] : null;
  if (!firstImageId) return null;
  const image =
    cornerstone.cache.getImage(firstImageId) ??
    (justLoadedImage?.imageId === firstImageId ? justLoadedImage : null);
  if (!image) return null;
  const spacing = [
    image.columnPixelSpacing ?? 1,
    image.rowPixelSpacing ?? 1,
    1,
  ];
  const dimensions = [image.columns, image.rows, imageIds.length];
  return {
    spacing,
    dimensions,
    // A 2D image gets masked in-plane whatever the stored box's through-plane
    // extent says, so the patient-box readings must not let that axis veto the
    // overlay (see maskingParametersToBounds).
    singleSlice: imageIds.length === 1,
    ...stackWorldGeometry(imageIds, spacing, dimensions),
  };
}

/**
 * Mount the submitted-mask overlay for the exam the host route has loaded.
 *
 * @param {object} args
 * @param {boolean} args.isInitialized The route's "exam is loaded" flag; the
 *   overlay resolves and draws only while it's true, and everything is torn
 *   down when it drops (navigation, errors).
 * @param {boolean} args.volumetric Volume (4-pane) vs stack (single image).
 * @param {string} [args.volumeId] Cache id of the loaded volume (volumetric).
 * @param {string[]} [args.imageIds] The loaded frames (stack).
 * @param {object} args.maskingDetails The getMaskingDetails(iec) response,
 *   whose masking_parameters this overlay draws.
 */
export function usePreviousMaskOverlay({
  isInitialized,
  volumetric,
  volumeId,
  imageIds,
  maskingDetails,
}) {
  const dispatch = useDispatch();

  const prevMaskOpacity = useSelector((state) => state.options.prevMaskOpacity);
  const prevMaskVisible = useSelector((state) => state.options.prevMaskVisible);
  // The draw effect reads the opacity through this ref so slider moves don't
  // re-run it (the restyle effect below applies them in place).
  const prevMaskOpacityRef = useRef(prevMaskOpacity);
  prevMaskOpacityRef.current = prevMaskOpacity;

  // IJK bounds of the mask this exam was already masked with, resolved against
  // the volume currently loaded — null when it has never been masked, or when
  // the stored geometry doesn't land on this volume at all.
  const [previousBounds, setPreviousBounds] = useState(null);

  // Resolve the stored masking parameters (millimetres, from the API) into IJK
  // bounds for the volume actually loaded — see maskingParametersToBounds,
  // which also makes this survive a different decimation. Runs once the load
  // has finished, because it needs the volume's geometry.
  //
  // The result also drives whether the panel's control is live: an exam that
  // has never been masked gets a greyed-out control reading "none".
  useEffect(() => {
    if (!isInitialized) {
      setPreviousBounds(null);
      dispatch(setOption({ key: "prevMaskAvailable", value: false }));
      return undefined;
    }
    const geometry = volumetric
      ? loadedVolumeGeometry(volumeId)
      : loadedStackGeometry(imageIds);
    const bounds = maskingParametersToBounds(
      maskingDetails?.masking_parameters,
      geometry,
    );
    setPreviousBounds(bounds);
    dispatch(setOption({ key: "prevMaskAvailable", value: Boolean(bounds) }));

    // No geometry yet: the mask review route's stack branch doesn't preload
    // its images (StackView displays them after render), so the first frame
    // may not be cached when isInitialized flips. Re-resolve as images land
    // until the geometry exists; volumes never take this path — their
    // geometry is available from volume creation.
    if (geometry) return undefined;
    const retry = (evt) => {
      const retryGeometry = volumetric
        ? loadedVolumeGeometry(volumeId)
        : loadedStackGeometry(imageIds, evt?.detail?.image);
      if (!retryGeometry) return;
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.IMAGE_LOADED,
        retry,
      );
      const retryBounds = maskingParametersToBounds(
        maskingDetails?.masking_parameters,
        retryGeometry,
      );
      setPreviousBounds(retryBounds);
      dispatch(
        setOption({ key: "prevMaskAvailable", value: Boolean(retryBounds) }),
      );
    };
    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.IMAGE_LOADED,
      retry,
    );
    return () => {
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.IMAGE_LOADED,
        retry,
      );
    };
  }, [isInitialized, maskingDetails, volumeId, volumetric, imageIds, dispatch]);

  // Draw (or tear down) the box. Kept separate from any selection-box effects
  // the host route runs: this box is a read-only reference that never moves,
  // so selection edits must not rebuild it and toggling it must not disturb
  // the selection's listeners or drag state. Opacity comes through the ref —
  // slider moves are applied in place by the restyle effect below.
  useEffect(() => {
    if (!isInitialized) return undefined;

    const draw = () => {
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine) return;
      const volume = volumetric ? cornerstone.cache.getVolume(volumeId) : null;
      renderingEngine.getViewports().forEach((item) => {
        const is3d = is3dViewport(item.id);
        const is2d = is2dViewport(item.id);
        if (!is3d && !is2d) return;

        if (!previousBounds || !prevMaskVisible) {
          if (is3d) removePreviousMaskBox(item);
          else removePreviousMaskBox2D(item);
        } else if (is3d) {
          if (!volume) return;
          addPreviousMaskBox(item, volume, previousBounds, {
            ...PREVIOUS_BOX_STYLE.box3d,
            opacity: prevMaskOpacityRef.current,
          });
        } else {
          addPreviousMaskBox2D(item, previousBounds, {
            ...PREVIOUS_BOX_STYLE.box2d,
            opacity: prevMaskOpacityRef.current,
            // The stack is one image, so its box isn't slice-gated.
            gateBySlice: volumetric,
          });
        }
      });
    };

    draw();

    // Draw as early as the viewports can carry the box, not just when the
    // volume finishes loading. VOLUME_VIEWPORT_NEW_VOLUME fires the moment a
    // viewport receives its volume actor — pixels still streaming in — and the
    // submitted mask's geometry needs none of those pixels, so the amber box
    // is up while the anatomy is still arriving. The event is dispatched on
    // the viewport's element (it doesn't bubble to eventTarget), so each
    // element gets its own listener, attached when ELEMENT_ENABLED announces
    // it — and directly for viewports that already exist when this effect
    // runs (show/hide toggles re-run it long after setup).
    const newVolumeEvent = cornerstone.Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME;
    const listeningElements = new Set();
    const attachNewVolumeListener = (element) => {
      if (!element || listeningElements.has(element)) return;
      listeningElements.add(element);
      element.addEventListener(newVolumeEvent, draw);
    };
    const handleElementEnabled = (evt) =>
      attachNewVolumeListener(evt.detail?.element);
    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.ELEMENT_ENABLED,
      handleElementEnabled,
    );
    cornerstone
      .getRenderingEngines()[0]
      ?.getViewports()
      .forEach((item) => attachNewVolumeListener(item.element));

    // Late backstops: the full-load events. They matter even with the early
    // draw above — the 3D glass fill needs the volume actor's shared scalar
    // texture, which can trail the actor itself, so this redraw completes a
    // wireframe-only early box (and re-anchors the stack overlays).
    cornerstone.eventTarget.addEventListener("VolumeReallyLoaded", draw);
    cornerstone.eventTarget.addEventListener("StackSegmentationReady", draw);

    return () => {
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.ELEMENT_ENABLED,
        handleElementEnabled,
      );
      listeningElements.forEach((element) =>
        element.removeEventListener(newVolumeEvent, draw),
      );
      cornerstone.eventTarget.removeEventListener("VolumeReallyLoaded", draw);
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        draw,
      );
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      renderingEngine?.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) removePreviousMaskBox(item);
        else if (is2dViewport(item.id)) removePreviousMaskBox2D(item);
      });
    };
  }, [isInitialized, previousBounds, prevMaskVisible, volumeId, volumetric]);

  // Live restyle for the Submitted Mask Opacity slider — in place, because
  // rebuilding the actor per slider step re-renders the volume twice a step.
  useEffect(() => {
    if (!isInitialized || !previousBounds || !prevMaskVisible) return undefined;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine) return;
      renderingEngine.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) {
          setPreviousMaskBoxStyle(item, {
            ...PREVIOUS_BOX_STYLE.box3d,
            opacity: prevMaskOpacity,
          });
        } else if (is2dViewport(item.id)) {
          item.element?.__prevMaskBox2dSetOpacity?.(prevMaskOpacity);
        }
      });
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isInitialized, previousBounds, prevMaskVisible, prevMaskOpacity]);
}
