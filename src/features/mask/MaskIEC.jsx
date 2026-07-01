import React from "react";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router-dom";

import {
  Enums,
  setMaskerConfig,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from "@/features/presentationSlice";

import { setTitle, setLoading, setOption } from "@/features/optionSlice";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import { volumeLoader } from "@cornerstonejs/core";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  getCoordsForStackSeg,
  getLabelmapBounds,
  loadIECVolumeAndSegmentation,
  loadVolumeAndSegmentation,
  getIECInfo,
  getImageIdsFromIEC,
  loadStackSegmentation,
} from "@/utilities";
import { getDicomDetails } from "@/visualreview";
import { getMaskingDetails, setMaskingStatus } from "@/masking.js";
import { submitFinalCoords } from "@/masking";
import { addMaskBox, removeMaskBox } from "@/lib/maskBox";
import { addMaskBox2D, removeMaskBox2D } from "@/lib/viewportFrame";

import LoadingSpinner from "@/components/LoadingSpinner";
import { VolumeView } from "@/features/volume-view";
import { StackView } from "@/features/stack-view";
import { ToolsPanel } from "@/features/tools";
import OperationsPanel from "@/components/OperationsPanel";
import NavigationPanel from "@/components/NavigationPanel";
import FilterPanel from "@/components/FilterPanel";
import { DetailsPanel } from "@/features/details";

import RouteLayout from "@/components/RouteLayout";
import ViewportPlaceholder from "@/components/ViewportPlaceholder";

import "./MaskIEC.css";

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

// Style for the selection box overlays (green box, in 2D and 3D).
const SELECTION_BOX_STYLE = {
  box2d: { borderColor: "rgba(74, 222, 128, 0.95)" },
  box3d: { color: [0.3, 0.85, 0.3], edgeColor: [0.6, 1, 0.6], opacity: 0.8 },
};

function transformDetails(details, maskingDetails) {
  const maskingParams = JSON.parse(maskingDetails.masking_parameters);
  const maskingFilters =
    maskingParams?.noise !== undefined
      ? `Noise: ${maskingParams?.noise} ● Fill: ${maskingParams?.fill}`
      : "";
  const maskingFunction =
    maskingParams?.function !== undefined
      ? `${maskingParams?.function === "sliceremove" ? "slice-remove" : maskingParams?.function} ● ${maskingParams?.form}`
      : "";

  return {
    IEC: details.image_equivalence_class_id,
    "Images in IEC": details.file_count,
    //'Processing Status': details.processing_status,
    "Review Status": details.review_status,
    "Masking Status": maskingDetails?.masking_status,
    "Masking Function": maskingFunction,
    "Masking Filters": maskingFilters,
    Modality: details.modality,
    "Patient ID": details.patient_id,
    "Series Instance UID": details.series_instance_uid,
    "Series Description": details.series_description,
    "Body Part Examined": details.body_part_examined,
    Path: details.path,
    download_path: details.download_path,
    download_name: details.download_name,
  };
}

export default function MaskIEC({
  iec,
  vr,
  noIecs,
  maskingStatus,
  dicomType,
  dicomTypeOptions,
  onNext = () => {},
  onPrevious = () => {},
}) {
  // const [showLeftPanel, setShowLeftPanel] = useState(true);
  // const [showRightPanel, setShowRightPanel] = useState(true);
  // const toggleLeftPanel = () => setShowLeftPanel(v => !v);
  // const toggleRightPanel = () => setShowRightPanel(v => !v);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Hide the filter panel in the mask VR route UI while keeping the
  // implementation intact. To bring it back, flip this to `true` and restore
  // grid-rows-[auto,1fr,auto] in MaskIEC.css.
  const showFilterPanel = true;

  const showLeftPanel = useSelector(
    (s) => s.presentation.panelConfig.open.left,
  );
  const showRightPanel = useSelector(
    (s) => s.presentation.panelConfig.open.right,
  );
  console.log(
    "showLeftPanel:",
    showLeftPanel,
    "showRightPanel:",
    showRightPanel,
  );
  const handleToggleLeft = () => dispatch(toggleLeftPanel());
  const handleToggleRight = () => dispatch(toggleRightPanel());

  const optionsForm = useSelector((state) => state.options.form);
  const optionsFunction = useSelector((state) => state.options.function);
  const optionsNoise = useSelector((state) => state.options.noise);
  const optionsFill = useSelector((state) => state.options.fill);
  const optionsDecimate = useSelector((state) => state.options.decimate);
  // The selection box is only movable/resizable while the selection tool is the
  // active left-click. Under window level / crosshairs it's frozen and
  // click-through so those tools receive the clicks (see refreshSelectionBoxes).
  const leftClickTool = useSelector((state) => state.options.leftClick);
  const [renderingEngine, setRenderingEngine] = useState(
    cornerstone.getRenderingEngine("re1"),
  );

  const [volumeId, setVolumeId] = useState();
  const [segmentationId, setSegmentationId] = useState();
  const [imageIds, setImageIds] = useState();

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector((state) => state.options.preset);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [volumetric, setVolumetric] = useState(true);
  const [details, setDetails] = useState(true);
  const [maskingDetails, setMaskingDetails] = useState(true);
  const [coords, setCoords] = useState();
  const loadRequestRef = useRef(0);

  let viewer;

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [showLeftPanel, showRightPanel]);

  useEffect(() => {
    const callback = () => {
      // trigger a new event, to enable segmentation drawing
      console.log("[callback] AllowSegmentationDrawing firing...");
      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        "AllowSegmentationDrawing",
        {
          volumeId,
        },
      );
    };

    // The volume fires "VolumeReallyLoaded"; the stack fires
    // "StackSegmentationReady". Both must enable segmentation drawing (activate
    // the scissors), so listen for both.
    // TODO: these string based event names need to be collected into
    // a library and accessed as enums
    cornerstone.eventTarget.addEventListener("VolumeReallyLoaded", callback);
    cornerstone.eventTarget.addEventListener("StackSegmentationReady", callback);

    // cleanup the callback
    return () => {
      cornerstone.eventTarget.removeEventListener(
        "VolumeReallyLoaded",
        callback,
      );
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        callback,
      );
    };
  }, []);

  useEffect(() => {
    // Only create a new rendering engine if one doesn't already exist
    if (renderingEngine === undefined) {
      console.log("Creating new rendering engine");
      setRenderingEngine(new cornerstone.RenderingEngine("re1"));
    }

    let toolGroup = ToolGroupManager.createToolGroup("toolGroup2d");
    let toolGroup3d = ToolGroupManager.createToolGroup("toolGroup3d");

    setToolGroup(toolGroup);
    setToolGroup3d(toolGroup3d);

    // TODO: this is for debug use only
    window.ToolGroupManager = ToolGroupManager;
    window.renderingEngine = renderingEngine;
    window.toolGroup2d = toolGroup;

    // Teardown function
    return () => {
      ToolGroupManager.destroyToolGroup("toolGroup2d");
      ToolGroupManager.destroyToolGroup("toolGroup3d");
      // Do not delete the RenderingEngine here, it needs
      // to stay, for now
    };
  }, [iec]);

  useLayoutEffect(() => {
    if (!iec) return; // nothing to load until an IEC is resolved
    console.log("MaskIEC useEffect[iec]:", iec);
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;

    const initialize = async () => {
      setIsInitialized(false);
      const details = await getDicomDetails(iec);
      const maskingDetails = await getMaskingDetails(iec);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log(
          "---------------> getDicomDetails & getMaskingDetails cancelled",
        );
        return;
      }
      const { volumetric } = details;
      setDetails(details);
      setMaskingDetails(maskingDetails);

      let decimate_count = optionsDecimate;
      const requestedDecimateCount =
        decimate_count === 0
          ? 2000 // Maximum number of frames to load if decimate is set to 0 (no decimation)
          : decimate_count;

      setIsErrored(false);
      let volumeId = `mask-${iec}-decimate-${decimate_count}`;
      // append a random number
      let segmentationId = `mask-${iec}-seg-${Math.floor(Math.random() * 10000)}`;

      const { frames } = await getIECInfo(iec, false, requestedDecimateCount);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> getIECInfo cancelled");
        return;
      }
      const imageIds = frames;

      setImageIds(imageIds);

      setVolumeId(volumeId);
      setVolumetric(volumetric); // still update state
      setSegmentationId(segmentationId);

      try {
        if (volumetric) {
          await loadVolumeAndSegmentation(imageIds, volumeId, segmentationId);
          if (isCancelled || requestId !== loadRequestRef.current) {
            console.log("---------------> loadVolumeAndSegmentation cancelled");
            return;
          }
          dispatch(setTitle("Mask Volume"));
          dispatch(reset());
          dispatch(setMaskerConfig());
          dispatch(setVolumeConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
          // dispatch(setOption({ key: "function", value: Enums.FunctionOptions.MASK }));
          // dispatch(setOption({ key: "form", value: Enums.FormOptions.CYLINDER }));
        } else {
          await loadStackSegmentation(imageIds, segmentationId);
          if (isCancelled || requestId !== loadRequestRef.current) {
            console.log("---------------> loadStackSegmentation cancelled");
            return;
          }
          dispatch(setTitle("Mask Stack"));
          dispatch(reset());
          dispatch(setMaskerConfig());
          dispatch(setStackConfig());
          dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
          dispatch(
            setOption({
              key: "function",
              value: Enums.FunctionOptions.BLACKOUT,
            }),
          );
          dispatch(setOption({ key: "form", value: Enums.FormOptions.CUBOID }));
        }
        dispatch(
          setOption({
            key: "leftClick",
            value: Enums.LeftClickOptions.SELECTION,
          }),
        );
        dispatch(
          setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }),
        );
      } catch (error) {
        console.error(error);
        notify.error(error, messages.errors.loadImage);
        setIsErrored(true);
        return;
      }

      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> initialization cancelled after loading");
        return;
      }

      // Make this IEC's segmentation active on the 2D drawing viewports, so the
      // scissors always has an active segmentation after navigation. The
      // per-viewport "ready" handlers can miss their event (cached load) or run
      // before the segmentation exists; doing it here — after the segmentation
      // is guaranteed created — is the reliable backstop.
      cornerstone
        .getRenderingEngines()[0]
        ?.getViewports()
        .forEach((vp) => {
          if (vp.id.startsWith("coronal3d")) return; // 3D pane: no drawing
          try {
            cornerstoneTools.segmentation.activeSegmentation.setActiveSegmentation(
              vp.id,
              segmentationId,
            );
          } catch {
            // Segmentation not represented in this viewport yet — ignore.
          }
        });

      setIsInitialized(true);
      dispatch(setLoading(false));
    };

    // Catch failures from awaits that run before the inner try (e.g. the
    // detail/info fetches), so a thrown ApiError surfaces as a toast and a
    // clean viewport instead of an unhandled promise rejection.
    initialize().catch((error) => {
      if (isCancelled || requestId !== loadRequestRef.current) return;
      console.error(error);
      notify.error(error, messages.errors.loadImage);
      setIsErrored(true);
      dispatch(setLoading(false));
    });

    return () => {
      isCancelled = true;
      // Make sure we disable drawing of the volume
      // when we leave, so the next one doesn't attempt to draw
      // before it exists
      setIsInitialized(false);
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
    };
  }, [iec, optionsDecimate]);

  // function handleApplyDecimate(decimateValue) {

  //   if (Number.isFinite(decimateValue) && decimateValue > 0) {
  //     setAppliedDecimate(decimateValue);
  //     return;
  //   }
  //   setAppliedDecimate(2000);
  // }

  function handleFilterAction({
    maskingStatus: newMaskingStatus,
    dicomType: newDicomType,
  }) {
    navigate(
      `/mask/vr/${vr}/*/${newMaskingStatus || "All"}/${newDicomType || "All"}`,
    );
  }

  useHotkeys("c", () => handleOperationAction("clear"));
  useHotkeys("a", () => handleOperationAction("accept"));
  useHotkeys("s", () => handleOperationAction("skip mask"));
  useHotkeys("n", () => handleOperationAction("nonmaskable mask"));

  // Volume mode: the selection is the bounding box of whatever has been drawn.
  // We hide the raw labelmap (the individual drawn rectangles) and instead show
  // a single clean green box — the 2D filled overlays and the 3D box actor —
  // covering that bounding box. Bounds come from the voxel manager's tracked
  // bounds (O(1)); we never rewrite the labelmap, so drawing stays fast.
  // (Stack mode is handled differently — see StackViewport.)
  // The selection is the bounding box of whatever has been drawn. We hide the
  // raw labelmap and instead show a single clean green box — the same overlay
  // styling in both viewers: the 2D filled outline overlays, plus the 3D box
  // actor in volume mode. Volume bounds come from the voxel manager's tracked
  // bounds (O(1)); stack bounds come from the drawn pixels. The stack is a
  // single image, so its 2D box isn't slice-gated.
  useEffect(() => {
    if (!segmentationId) return;

    // (The raw labelmap is hidden where each viewport adds its representation —
    // see VolumeViewport / StackViewport — so it's reliably hidden from the
    // first frame regardless of this effect's timing.)

    const is3dViewport = (id) => id.startsWith("coronal3d");
    // 2D mask viewports: the volume orthographic panes and the stack pane.
    const is2dViewport = (id) => id.endsWith("2d") || id === "myviewport";

    // Live preview of the selection box while a 2D handle drag is in flight.
    // The dragged pane updates its own overlay each mousemove, but the other
    // views — the 3D box actor and the other 2D orthographic panes — would
    // otherwise only rebuild on release (via the segmentation-data-modified
    // event fired on commit). Redraw them from the in-progress coords so every
    // view tracks the drag. We coalesce to one redraw per animation frame so a
    // fast drag doesn't queue a volume render per mousemove, and we only touch
    // the box overlays — never the labelmap — so nothing is committed until
    // release.
    let previewRaf = 0;
    let previewCoords = null;
    const drawPreviewBoxes = () => {
      previewRaf = 0;
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine || !previewCoords) return;
      const volume = volumetric ? cornerstone.cache.getVolume(volumeId) : null;
      renderingEngine.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) {
          // Rebuild the box actor (same call the commit path uses) rather than
          // mutating the existing actor's points in place — an in-place point
          // update doesn't reliably re-render on the 3D volume viewport.
          if (volume) {
            addMaskBox(item, volume, previewCoords, SELECTION_BOX_STYLE.box3d);
          }
        } else if (is2dViewport(item.id)) {
          // Push the in-progress coords into each 2D box so the non-dragged
          // panes follow. The dragged pane already updated itself, so re-setting
          // it to the same coords is a harmless no-op.
          item.element?.__maskBox2dSetLive?.(previewCoords);
        }
      });
    };
    const schedulePreview = (liveCoords) => {
      previewCoords = liveCoords;
      if (!previewRaf) {
        previewRaf = requestAnimationFrame(drawPreviewBoxes);
      }
    };

    const refreshSelectionBoxes = () => {
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine) return;

      let bounds;
      let volume;
      if (volumetric) {
        bounds = getLabelmapBounds(segmentationId);
        volume = cornerstone.cache.getVolume(volumeId);
      } else {
        const imageIds = segmentation.getLabelmapImageIds(segmentationId);
        bounds = imageIds?.length ? getCoordsForStackSeg(imageIds) : null;
      }

      // Commit a drag-resize of the selection box. The selection is defined
      // solely by its IJK bounding box (the mask is a cuboid/cylinder built
      // from these coords — the labelmap voxels are never submitted). Writing
      // the resized bounds onto the labelmap's voxel manager makes
      // getLabelmapBounds — and so every box overlay and handleAccept — reflect
      // the resize. We set the tracked bounds rather than rewriting voxels: the
      // raw labelmap is hidden, and its now-stale voxels never resurface
      // because the bounds only grow from here as new rectangles are drawn.
      const commitResize = (newCoords) => {
        const segVolume = cornerstone.cache.getVolume(segmentationId);
        if (!segVolume?.voxelManager) return;
        segVolume.voxelManager.setBounds([
          [newCoords.i.min, newCoords.i.max],
          [newCoords.j.min, newCoords.j.max],
          [newCoords.k.min, newCoords.k.max],
        ]);
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
          segmentationId,
        );
      };

      // Stack equivalent of commitResize. A stack has no tracked bounds —
      // getCoordsForStackSeg derives the box by scanning labelmap pixels — so we
      // materialise the new box: clear every labelmap image and fill the resized
      // rectangle (i, j) on the frames (k) it covers. The raw labelmap is
      // hidden, so only the overlay box shows; handleAccept reads the same
      // scanned bounds. Mirrors how handleClear mutates the stack pixels.
      const commitStackResize = (newCoords) => {
        const labelmapImageIds =
          segmentation.getLabelmapImageIds(segmentationId);
        if (!labelmapImageIds?.length) return;
        labelmapImageIds.forEach((imgId, k) => {
          const img = cornerstone.cache.getImage(imgId);
          const pixelData = img?.getPixelData();
          if (!pixelData) return;
          pixelData.fill(0);
          if (k < newCoords.k.min || k > newCoords.k.max) return;
          const { columns } = img;
          for (let j = newCoords.j.min; j <= newCoords.j.max; j += 1) {
            const rowStart = j * columns;
            for (let i = newCoords.i.min; i <= newCoords.i.max; i += 1) {
              pixelData[rowStart + i] = 1;
            }
          }
        });
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
          segmentationId,
        );
      };

      renderingEngine.getViewports().forEach((item) => {
        const is3d = is3dViewport(item.id);
        const is2d = is2dViewport(item.id);
        if (!is3d && !is2d) return;

        if (!bounds) {
          if (is3d) removeMaskBox(item);
          else removeMaskBox2D(item);
        } else if (is3d) {
          addMaskBox(item, volume, bounds, SELECTION_BOX_STYLE.box3d);
        } else {
          // The stack is one image, so don't gate its box by slice.
          addMaskBox2D(item, bounds, {
            ...SELECTION_BOX_STYLE.box2d,
            gateBySlice: volumetric,
            // Move/resize handles are enabled only while the selection tool is
            // active — under window level / crosshairs the box is frozen and
            // click-through so those tools receive the clicks. Volume and stack
            // commit the change differently (voxel-manager bounds vs. rewriting
            // labelmap pixels), so each supplies its own handler.
            onResize:
              leftClickTool === Enums.LeftClickOptions.SELECTION
                ? volumetric
                  ? commitResize
                  : commitStackResize
                : undefined,
            // Mirror the in-progress box into the other panes (the 3D box and
            // the other 2D orthographic panes) while dragging so they track the
            // resize live.
            onLiveResize: schedulePreview,
          });
        }
      });
    };

    const handler = (evt) => {
      if (evt.detail?.segmentationId === segmentationId) {
        refreshSelectionBoxes();
      }
    };

    cornerstone.eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
      handler,
    );

    // Redraw immediately so a left-click tool change re-renders any existing box
    // with the right interactivity (frozen vs. movable) without waiting for the
    // next segmentation edit. No-op when nothing has been drawn yet.
    refreshSelectionBoxes();

    return () => {
      cornerstone.eventTarget.removeEventListener(
        csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
        handler,
      );
      if (previewRaf) cancelAnimationFrame(previewRaf);
      // Clear the boxes so they don't linger onto the next segmentation / IEC.
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      renderingEngine?.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) removeMaskBox(item);
        else if (is2dViewport(item.id)) removeMaskBox2D(item);
      });
    };
  }, [segmentationId, volumeId, volumetric, leftClickTool]);

  async function handleOperationAction(action) {
    switch (action) {
      case "clear":
        handleClear();
        break;
      case "accept":
        // Only advance when the mask was actually submitted.
        if (await handleAccept()) onNext();
        break;
      case "skip mask":
      case "nonmaskable mask":
        try {
          await setMaskingStatus(iec, action);
          notify.success(
            action === "skip mask"
              ? messages.mask.skipped
              : messages.mask.notMaskable,
          );
          onNext();
        } catch (error) {
          notify.error(error, messages.errors.saveStatus);
        }
        break;
      default:
        console.warn("Unknown action:", action);
    }
  }

  function handleClear() {
    // Clear the selection box overlays from the 3D and 2D viewports.
    const renderingEngine = cornerstone.getRenderingEngines()[0];
    renderingEngine?.getViewports().forEach((item) => {
      if (item.id.startsWith("coronal3d")) {
        removeMaskBox(item);
      } else if (item.id.endsWith("2d")) {
        removeMaskBox2D(item);
      }
    });

    if (volumetric) {
      // Delete the current segmentation and add a new one (and activate it)
      // using a new randomly-named segmentation ID. This gets around a bug
      // with the 3d viewport not rendering after clearing a segmentation.
      // Note: this does not prevent the error in updateSurfaceData for the
      // previous segmentation, however.
      cornerstoneTools.segmentation.removeSegmentation(segmentationId);
      let newSegmentationId = `mask-${iec}-seg-${Math.floor(Math.random() * 10000)}`;

      volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
        volumeId: newSegmentationId,
      });

      cornerstoneTools.segmentation.addSegmentations([
        {
          segmentationId: newSegmentationId,
          representation: {
            // The type of segmentation
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            // The actual segmentation data, in the case of labelmap this is a
            // reference to the source volume of the segmentation.
            data: {
              volumeId: newSegmentationId,
            },
          },
        },
      ]);

      // triggering this event will cause the viewports to automatically
      // add a representation for the new segmentation
      cornerstone.triggerEvent(cornerstone.eventTarget, "VolumeReallyLoaded", {
        volumeId,
        segmentationId: newSegmentationId,
      });

      setSegmentationId(newSegmentationId);
    } else {
      const imageIds = segmentation.getLabelmapImageIds(segmentationId);
      imageIds.forEach((imgId) => {
        const img = cornerstone.cache.getImage(imgId);
        const pixelData = img.getPixelData();
        if (pixelData) pixelData.fill(0);
      });

      // flag data as updated so it will redraw
      cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
        segmentationId,
      );
    }
  }

  async function handleAccept() {
    let finalCoords = coords;
    let selectedForm = optionsForm;
    let selectedFunction = optionsFunction;
    let selectedNoise = optionsNoise;
    let selectedFill = optionsFill;

    let spacing = null;

    if (volumetric) {
      // The selection is the bounding box of the drawn voxels. Require a real
      // 3D box: reject an empty selection or one confined to a single plane.
      const bounds = getLabelmapBounds(segmentationId);
      if (!bounds) {
        notify.info(messages.maskValidation.emptySelection);
        return false;
      }
      if (
        bounds.i.min === bounds.i.max ||
        bounds.j.min === bounds.j.max ||
        bounds.k.min === bounds.k.max
      ) {
        notify.info(messages.maskValidation.notABox);
        return false;
      }
      finalCoords = bounds;
      const volume = cornerstone.cache.getVolume(volumeId);
      spacing = volume.spacing;
    } else {
      const imageIds = segmentation.getLabelmapImageIds(segmentationId);
      if (!coords) {
        finalCoords = getCoordsForStackSeg(imageIds);
        setCoords(finalCoords);
      }
      const image = cornerstone.cache.getImage(imageIds[0]);
      spacing = [image.columnPixelSpacing ?? 1, image.rowPixelSpacing ?? 1, 1];
    }

    console.log(finalCoords, spacing, iec);
    try {
      await submitFinalCoords(
        finalCoords,
        spacing,
        iec,
        selectedForm,
        selectedFunction,
        selectedNoise,
        selectedFill,
      );
    } catch (error) {
      notify.error(error, messages.errors.submitMask);
      return false;
    }

    notify.success(messages.mask.submitted);
    return true;
  }

  if (!iec) {
    return (
      <RouteLayout
        routeName="mask-vr"
        leftPanel={
          <NavigationPanel
            onNext={onNext}
            onPrevious={onPrevious}
            currentId={iec}
            idLabel="IEC"
          />
        }
        middlePanel={
          <>
            {showFilterPanel && vr && (
              <FilterPanel
                vr={vr}
                maskingStatus={maskingStatus}
                dicomType={dicomType}
                dicomTypeOptions={dicomTypeOptions}
                onAction={handleFilterAction}
              />
            )}
            {noIecs && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-300">
                {messages.filters.noResults}
              </div>
            )}
          </>
        }
        rightPanel={
          <div className="side-panel">
            <div className="wrapper" />
          </div>
        }
        showLeftPanel={showLeftPanel}
        showRightPanel={true}
      />
    );
  }

  // Load failures are surfaced as a toast; keep the viewport itself clean
  // with a neutral placeholder rather than an error card.
  if (isErrored) {
    return <ViewportPlaceholder />;
  }
  if (!isInitialized) {
    // display nothing; a loading spinner will be handled elsewhere
    return <></>;
  }

  if (volumetric) {
    console.log(">>>>> about to pass volumeId=", volumeId);
    viewer = (
      <VolumeView
        volumeId={volumeId}
        segmentationId={segmentationId}
        preset3d={preset3d}
        toolGroup={toolGroup}
        toolGroup3d={toolGroup3d}
        modality={details.modality}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
    );
  } else {
    viewer = (
      <StackView
        segmentationId={segmentationId}
        toolGroup={toolGroup}
        frames={imageIds}
        onToggleLeftPanel={handleToggleLeft}
        onToggleRightPanel={handleToggleRight}
      />
    );
  }

  return (
    <RouteLayout
      routeName={vr ? "mask-vr" : undefined}
      leftPanel={
        // showLeftPanel ?
        <>
          {vr && (
            <NavigationPanel
              onNext={onNext}
              onPrevious={onPrevious}
              currentId={iec}
              idLabel="IEC"
            />
          )}
          <ToolsPanel
            toolGroup={toolGroup}
            toolGroup3d={toolGroup3d}
            preset3d={preset3d}
            onPresetChange={
              (value) => dispatch(setOption({ key: "preset", value })) // ← dispatch changes
            }
            renderingEngine={renderingEngine}
            // onApplyDecimate={handleApplyDecimate}
          />
        </>
        // : null
      }
      middlePanel={
        <>
          {showFilterPanel && vr && (
            <FilterPanel
              vr={vr}
              maskingStatus={maskingStatus}
              dicomType={dicomType}
              dicomTypeOptions={dicomTypeOptions}
              onAction={handleFilterAction}
            />
          )}
          {viewer}
          <OperationsPanel onAction={handleOperationAction} />
        </>
      }
      rightPanel={
        // showRightPanel ?
        <DetailsPanel details={transformDetails(details, maskingDetails)} />
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
