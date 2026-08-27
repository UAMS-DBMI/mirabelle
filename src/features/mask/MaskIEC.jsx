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
  decacheVolume,
  removeCachedImages,
} from "@/utilities";
import { getDicomDetails } from "@/visualreview";
import { getMaskingDetails, setMaskingStatus } from "@/masking.js";
import { submitFinalCoords } from "@/masking";
import {
  addMaskBox,
  removeMaskBox,
  setMaskBoxStyle,
  SELECTION_EDGE_COLOR,
  SELECTION_FILL_COLOR,
} from "@/lib/maskBox";
import { describeMaskingParameters } from "@/lib/maskingParameters";
import { addMaskBox2D, removeMaskBox2D } from "@/lib/viewportFrame";
import {
  usePreviousMaskOverlay,
  resolveSubmittedMaskBounds,
  watchViewportVolumeAttach,
  is2dViewport,
  is3dViewport,
} from "@/features/mask/usePreviousMaskOverlay";
import {
  MASK_DRAW_START_EVENT,
  MASK_LIVE_DRAW_EVENT,
} from "@/lib/clampedRectangleScissors";
import {
  applyMaskSelection,
  forgetMaskDraft,
  rememberMaskSelection,
  restoreMaskSelection,
  selectionMatchesBounds,
} from "@/lib/maskDrafts";
import { getMaskView, rememberMaskView } from "@/lib/maskViewPrefs";

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

// The selection green as a CSS colour, for the DOM overlays on the 2D panes.
const selectionCss = (color, alpha) =>
  `rgba(${color.map((channel) => Math.round(channel * 255)).join(", ")}, ${alpha})`;

// Style for the selection box overlays (green box, in 2D and 3D). Both panes
// draw their edges in SELECTION_EDGE_COLOR — one selection, one colour,
// whichever view you're looking at.
const SELECTION_BOX_STYLE = {
  // fillColor/fillAlpha are the translucent middle, passed explicitly (rather
  // than left to the stylesheet) because the opacity slider scales the FILL
  // only — the border and the drag handles hold full strength at any slider
  // position, so the outline never gets harder to find. fillAlpha matches the
  // stylesheet's baseline so slider 100% looks identical to the CSS default.
  box2d: {
    borderColor: selectionCss(SELECTION_EDGE_COLOR, 0.95),
    fillColor: SELECTION_EDGE_COLOR,
    fillAlpha: 0.18,
  },
  // The 3D faces are thin voxel panes rendered inside the volume ray-cast (see
  // lib/maskBox); fillAlpha is per ray SAMPLE, and a ray takes a few samples
  // to cross a pane, so the per-face opacity lands a bit above this value.
  box3d: {
    color: SELECTION_EDGE_COLOR,
    // A hairline. The wireframe's job is to delineate the selection, not to
    // draw attention to itself — and it is drawn on top of the shader's own
    // edge band, so anything heavier reads as a doubled, chunky outline.
    width: 1,
    fillColor: SELECTION_FILL_COLOR,
    fillAlpha: 0.15,
  },
};

// How the mask boxes look on an exam nobody has adjusted yet: the selection at
// half opacity — solid enough to read as a region, transparent enough to check
// the anatomy underneath — and the previously submitted mask shown faintly
// behind it at 20%. Matches optionSlice's defaults and must stay in step with
// them, or an exam would open at one value and the panel would show another.
// Exams the curator HAS adjusted reopen at their own remembered setting (see
// lib/maskViewPrefs).
const DEFAULT_MASK_VIEW = {
  opacity: 0.5,
  visible: true,
  prevOpacity: 0.2,
  prevVisible: true,
};

// (Viewport-id helpers is3dViewport / is2dViewport are shared with the review
// route — see features/mask/usePreviousMaskOverlay.)

// Pacing for the 3D box preview during a live drag. Each 3D tick costs a full
// volume re-render, which cornerstone runs on the NEXT animation frame — so
// the cost lands after addMaskBox has already returned and a fixed interval
// can't tell whether the previous render has even finished. Instead we keep at
// most one 3D render in flight (waiting for its IMAGE_RENDERED), then measure
// how long it took and stay idle for the same length again. That leaves the
// volume at most half the frame budget no matter how heavy it is: fast volumes
// track the drag closely, slow ones back off on their own instead of
// saturating the main thread and stalling the drag itself.
const PREVIEW_3D_DUTY_CYCLE = 1;
// Never idle longer than this between 3D ticks, however slow the volume is —
// past it the box stops reading as "following" the drag at all.
const PREVIEW_3D_MAX_IDLE_MS = 250;
// If IMAGE_RENDERED never arrives (viewport torn down mid-drag), stop waiting
// after this long so the 3D preview can't wedge for the rest of the drag.
const PREVIEW_3D_STALL_MS = 500;

function transformDetails(details, maskingDetails) {
  return {
    IEC: details.image_equivalence_class_id,
    "Images in IEC": details.file_count,
    //'Processing Status': details.processing_status,
    "Review Status": details.review_status,
    "Masking Status": maskingDetails?.masking_status,
    ...describeMaskingParameters(maskingDetails?.masking_parameters),
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
  // Selection-box appearance, driven by the Mask controls in the tools panel.
  // Hiding only affects the overlays — the underlying selection bounds are
  // untouched, so accepting a hidden mask still submits what was drawn.
  const maskOpacity = useSelector((state) => state.options.maskOpacity);
  const maskVisible = useSelector((state) => state.options.maskVisible);
  // The box effect reads the opacity through this ref so slider moves don't
  // re-run it (see the style-only effect that applies them in place).
  const maskOpacityRef = useRef(maskOpacity);
  maskOpacityRef.current = maskOpacity;
  // The previously submitted mask's pair — the overlay itself is run by
  // usePreviousMaskOverlay below; these feed the per-exam view memory.
  const prevMaskOpacity = useSelector((state) => state.options.prevMaskOpacity);
  const prevMaskVisible = useSelector((state) => state.options.prevMaskVisible);
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
  // Bumped by "Reload Image" to re-run the load effect after the cached exam
  // has been dropped, re-fetching any slices that failed to download.
  const [reloadToken, setReloadToken] = useState(0);
  const loadRequestRef = useRef(0);
  // Set by a terminal action (mask submitted, or exam skipped / non-maskable)
  // so the load effect's cleanup doesn't re-save the now-irrelevant selection
  // as a draft after we forget it.
  const skipDraftSaveRef = useRef(false);
  // The bounds the selection was seeded with from the exam's already-submitted
  // mask (null when nothing was seeded, or once the curator edits). The draft
  // savers compare against it: a selection still equal to the seed is the
  // exam's stored state, not unfinished curator work, and saving it would flag
  // every previously-masked exam as drafted just for being opened.
  const seededBoundsRef = useRef(null);
  // Tracks the segmentation currently backing the viewers, so the unmount
  // cleanup can decache its labelmap volume (the segmentationId state captured
  // by the effect closure is stale by then).
  const activeSegmentationIdRef = useRef(null);

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
    cornerstone.eventTarget.addEventListener(
      "StackSegmentationReady",
      callback,
    );

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

    // Re-apply this IEC's saved (unsubmitted) selection as soon as its
    // segmentation exists — "MaskSegmentationReady" for volumes, which fires
    // the moment the empty labelmap is created, BEFORE the anatomy has
    // streamed in (the selection is voxel-manager bounds; it needs no
    // pixels), so the box is already up while the image loads.
    // "VolumeReallyLoaded" is kept as a backstop, and stacks fire
    // "StackSegmentationReady" (their labelmap is derived from the loaded
    // images, so there is no earlier moment). Gated to the active
    // segmentation and to one attempt per load, so the synthetic
    // VolumeReallyLoaded that Clear fires can't resurrect the draft it just
    // discarded.
    //
    // With no draft, the selection is instead seeded from the exam's
    // already-submitted mask, so the curator starts from the exam's last
    // submitted state rather than an empty box. Priority order: the curator's
    // own unfinished draft always beats the seed.
    let draftRestored = false;
    // What the seed needs from initialize(), captured before the loads it
    // awaits can fire the events this handler runs on.
    let seedContext = null;
    seededBoundsRef.current = null;
    const restoreDraft = (evt) => {
      const segId = evt.detail?.segmentationId;
      if (
        draftRestored ||
        !segId ||
        segId !== activeSegmentationIdRef.current
      ) {
        return;
      }
      draftRestored = true;
      if (restoreMaskSelection(iec, segId)) return;
      if (!seedContext) return;
      // Same geometry resolution the amber overlay draws from, so the green
      // box lands exactly where the amber one shows the submitted mask.
      const seedBounds = resolveSubmittedMaskBounds(seedContext);
      if (!seedBounds) return;
      // The ref must be set before the apply: applying fires the
      // data-modified event synchronously, and the live draft saver reads the
      // ref to know this edit is the seed, not the curator.
      seededBoundsRef.current = seedBounds;
      if (!applyMaskSelection(segId, seedBounds)) {
        seededBoundsRef.current = null;
      }
    };
    cornerstone.eventTarget.addEventListener(
      "MaskSegmentationReady",
      restoreDraft,
    );
    cornerstone.eventTarget.addEventListener(
      "VolumeReallyLoaded",
      restoreDraft,
    );
    cornerstone.eventTarget.addEventListener(
      "StackSegmentationReady",
      restoreDraft,
    );

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
      activeSegmentationIdRef.current = segmentationId;
      seedContext = { volumetric, volumeId, imageIds, maskingDetails };

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
        // A load abandoned by navigation may fail against torn-down state, or
        // lose a cache reservation the live exam has since taken — that's
        // expected, and must not flag the exam now on screen as errored.
        if (isCancelled || requestId !== loadRequestRef.current) return;
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
      // Save the drawn-but-unsubmitted selection before the segmentation is
      // torn down below, so navigating (next/previous/queue click/leaving the
      // route) doesn't lose the work — it's restored on the next visit. Skip
      // this when the exam was just submitted/skipped: that draft was already
      // forgotten and must not be resurrected from the still-drawn box.
      if (skipDraftSaveRef.current) {
        skipDraftSaveRef.current = false;
      } else if (
        !seededBoundsRef.current ||
        !selectionMatchesBounds(
          activeSegmentationIdRef.current,
          seededBoundsRef.current,
        )
      ) {
        // A selection still equal to the seed is the exam's stored state, not
        // curator work — leaving without touching it must not flag the exam
        // as drafted.
        rememberMaskSelection(iec, activeSegmentationIdRef.current);
      }
      // Held for the decache at the end of this cleanup, which runs after the
      // ref has been cleared below.
      const retiredSegmentationId = activeSegmentationIdRef.current;
      // This exam's segmentation is going away, so the ref must stop naming
      // it. A volume still streaming when the curator navigates fires its
      // VolumeReallyLoaded AFTER the next exam's listeners are attached, and
      // with the ref stale that event passes the identity gate and consumes
      // the new load's one-shot restore before the new exam's own ready event
      // arrives — the seed/draft then silently never applies. (This is timing
      // dependent: it only bites when the previous volume outlives the
      // navigation, which is what made the missing box intermittent.)
      activeSegmentationIdRef.current = null;
      cornerstone.eventTarget.removeEventListener(
        "MaskSegmentationReady",
        restoreDraft,
      );
      cornerstone.eventTarget.removeEventListener(
        "VolumeReallyLoaded",
        restoreDraft,
      );
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        restoreDraft,
      );
      // Make sure we disable drawing of the volume
      // when we leave, so the next one doesn't attempt to draw
      // before it exists
      setIsInitialized(false);
      cornerstoneTools.segmentation.removeAllSegmentations();
      cornerstoneTools.segmentation.removeAllSegmentationRepresentations();
      // removeAllSegmentations only drops tool state — free the labelmap
      // volume (and its slice images) too, or each visit leaks a full-size
      // volume into the fixed Cornerstone cache.
      decacheVolume(retiredSegmentationId);
    };
  }, [iec, optionsDecimate, reloadToken]);

  // Drop the cached exam and load it again. Failed downloads are never cached
  // (Cornerstone skips errored frames and the browser doesn't cache the error
  // response), so the re-load genuinely retries the missing slices against the
  // server.
  function handleReload() {
    if (volumetric && volumeId) {
      decacheVolume(volumeId);
    } else if (imageIds?.length) {
      removeCachedImages(imageIds);
    }
    setReloadToken((token) => token + 1);
  }

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

    // The panel's opacity is folded into the styles at draw time, through a
    // ref rather than a dep: slider changes are applied in place by the
    // style-only effect below, so they must not tear this effect (listeners,
    // actors, fill voxels) down — that made the slider unusable.
    const box2dStyle = () => ({
      ...SELECTION_BOX_STYLE.box2d,
      opacity: maskOpacityRef.current,
    });
    const box3dStyle = () => ({
      ...SELECTION_BOX_STYLE.box3d,
      opacity: maskOpacityRef.current,
    });

    // (The raw labelmap is hidden where each viewport adds its representation —
    // see VolumeViewport / StackViewport — so it's reliably hidden from the
    // first frame regardless of this effect's timing.)

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
    // 3D preview back-pressure (see PREVIEW_3D_DUTY_CYCLE): the element whose
    // IMAGE_RENDERED we're waiting on, when that wait started, and the
    // earliest time the next 3D tick may go out.
    let preview3dElement = null;
    let preview3dStartedAt = 0;
    let preview3dReadyAt = 0;
    const onPreview3dRendered = () => {
      const now = performance.now();
      preview3dElement = null;
      preview3dReadyAt =
        now +
        Math.min(
          (now - preview3dStartedAt) * PREVIEW_3D_DUTY_CYCLE,
          PREVIEW_3D_MAX_IDLE_MS,
        );
    };
    // True when the previous 3D tick is still rendering, so this one is
    // skipped rather than queued behind it.
    const preview3dBusy = (now) => {
      if (!preview3dElement) return false;
      if (now - preview3dStartedAt < PREVIEW_3D_STALL_MS) return true;
      // Its IMAGE_RENDERED is never coming — drop the wait.
      preview3dElement.removeEventListener(
        cornerstone.Enums.Events.IMAGE_RENDERED,
        onPreview3dRendered,
      );
      preview3dElement = null;
      return false;
    };
    const drawPreviewBoxes = () => {
      previewRaf = 0;
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine || !previewCoords) return;
      // Nothing to preview while the box is hidden — refreshSelectionBoxes has
      // already torn the overlays down.
      if (!maskVisible) return;
      const volume = volumetric ? cornerstone.cache.getVolume(volumeId) : null;
      renderingEngine.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) {
          // previewOnly: addMaskBox moves the wireframe AND the shader fill
          // to the previewed bounds at a coarser render quality — the fill is
          // uniforms on the mask-box mapper plugin, so a move is free. The
          // per-tick cost is the volume re-render itself, paced by measured
          // render time (the back-pressure above) rather than animation-frame
          // rate. The commit path redraws everything exact at full quality.
          const now = performance.now();
          if (!volume || now < preview3dReadyAt || preview3dBusy(now)) return;
          preview3dElement = item.element;
          preview3dStartedAt = now;
          // Paced by when this render actually lands, not by a fixed guess.
          item.element?.addEventListener(
            cornerstone.Enums.Events.IMAGE_RENDERED,
            onPreview3dRendered,
            { once: true },
          );
          addMaskBox(item, volume, previewCoords, {
            ...box3dStyle(),
            previewOnly: true,
          });
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

    // Drop any not-yet-drawn preview. Runs whenever an authoritative redraw
    // (commit, external edit, tool change) supersedes the drag: a preview raf
    // firing AFTER the commit used to re-enter preview quality — coarse
    // sampling, thick fill shell — with no later commit to exit it, leaving
    // the volume permanently noisy and every camera move visibly shifting
    // color as vtk switched interaction quality on top of the coarse base.
    const cancelPreview = () => {
      if (previewRaf) {
        cancelAnimationFrame(previewRaf);
        previewRaf = 0;
      }
      previewCoords = null;
    };

    // Bounds already committed to the labelmap, if any — used to merge a
    // fresh scissors draw's in-progress bounds with prior selection so
    // extending an existing box onto a new slice doesn't preview as a shrink
    // back to just the new stroke while the drag is still in flight.
    const getCommittedBounds = () => {
      if (!segmentation.state.getSegmentation(segmentationId)) return null;
      if (volumetric) return getLabelmapBounds(segmentationId);
      const imageIds = segmentation.getLabelmapImageIds(segmentationId);
      return imageIds?.length ? getCoordsForStackSeg(imageIds) : null;
    };

    // Starting a stroke while the box is hidden un-hides it. Hiding means
    // "let me see the anatomy", not "let me edit blind": the scissors stay
    // armed while the box is hidden, and a stroke merges into the existing
    // bounds, so without this a curator could silently grow a selection they
    // cannot see and then submit it. The un-hide fires at MOUSE-DOWN (the
    // scissors subclass announces it) rather than on the first drag step, so
    // the existing selection is back on screen before any part of the stroke
    // is drawn — nothing happens blind, and the box doesn't pop in mid-drag.
    // Un-hiding beats disarming the tool, which would leave the curator
    // working out why drawing silently stopped. Re-running this effect at
    // press time (maskVisible is a dep) is safe: the stroke's drag state
    // lives in the Cornerstone tool, not here, and no overlay handle can be
    // mid-drag — the overlays don't exist while hidden.
    const handleDrawStart = (evt) => {
      if (evt.detail?.segmentationId !== segmentationId) return;
      if (!maskVisible) {
        dispatch(setOption({ key: "maskVisible", value: true }));
      }
    };

    // Live preview of a brand-new rectangle being drawn (as opposed to a
    // resize drag of an existing box, handled by onLiveResize below). The
    // scissors tool only fills the labelmap on mouse-up, so
    // ClampedRectangleScissorsTool broadcasts the in-progress rectangle's IJK
    // bounds on every drag step instead.
    const handleLiveDraw = (evt) => {
      const { segmentationId: liveSegId, bounds } = evt.detail ?? {};
      if (liveSegId !== segmentationId || !bounds) return;
      // Backstop for the press-time un-hide above, for any stroke that starts
      // without a fresh mouse-down. Idempotent — same-value dispatches don't
      // re-render.
      if (!maskVisible) {
        dispatch(setOption({ key: "maskVisible", value: true }));
      }
      const committed = getCommittedBounds();
      const merged = committed
        ? {
            i: {
              min: Math.min(committed.i.min, bounds.i.min),
              max: Math.max(committed.i.max, bounds.i.max),
            },
            j: {
              min: Math.min(committed.j.min, bounds.j.min),
              max: Math.max(committed.j.max, bounds.j.max),
            },
            k: {
              min: Math.min(committed.k.min, bounds.k.min),
              max: Math.max(committed.k.max, bounds.k.max),
            },
          }
        : bounds;
      schedulePreview(merged);
    };

    const refreshSelectionBoxes = () => {
      // This redraw is authoritative — a stale preview must not land after it.
      cancelPreview();
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine) return;
      // segmentationId is React state, set before Cornerstone finishes
      // registering the segmentation. Bail until it exists so the immediate
      // (mount / tool-change) refresh doesn't call getLabelmapImageIds /
      // getLabelmapBounds on a segmentation that isn't there yet — that throws
      // "Cannot read properties of undefined (reading 'representationData')".
      if (!segmentation.state.getSegmentation(segmentationId)) return;

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
        // Redraw the overlays and save the draft directly instead of firing
        // SEGMENTATION_DATA_MODIFIED. A bounds-only resize doesn't touch a
        // single labelmap voxel, but that event tells cornerstone the labelmap
        // pixels changed: with no modifiedSlicesToUse, performVolumeLabelmapUpdate
        // marks EVERY slice dirty, so each viewport carrying the segmentation
        // re-uploads the entire labelmap texture one texSubImage3D per slice
        // (hundreds of GPU calls per mouse-up) and then re-renders — all to
        // redraw a box this app draws itself. Only the two listeners below
        // actually needed waking.
        refreshSelectionBoxes();
        rememberMaskSelection(iec, segmentationId);
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

        // Hiding the box is the same teardown as having nothing selected — the
        // bounds stay in the labelmap either way, so unhiding brings the box
        // back exactly where it was.
        if (!bounds || !maskVisible) {
          if (is3d) removeMaskBox(item);
          else removeMaskBox2D(item);
        } else if (is3d) {
          addMaskBox(item, volume, bounds, box3dStyle());
        } else {
          // The stack is one image, so don't gate its box by slice.
          addMaskBox2D(item, bounds, {
            ...box2dStyle(),
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
    cornerstone.eventTarget.addEventListener(
      MASK_LIVE_DRAW_EVENT,
      handleLiveDraw,
    );
    cornerstone.eventTarget.addEventListener(
      MASK_DRAW_START_EVENT,
      handleDrawStart,
    );

    // Draw as early as the panes can carry the box. A draft or seed applies
    // the moment the empty labelmap exists — before the anatomy has streamed
    // in (see loadVolumeAndSegmentation) — and drawing the box needs none of
    // those pixels, so it goes up per viewport as each receives its volume
    // actor: the same early-draw mechanism as the amber overlay's.
    // "VolumeReallyLoaded" is the late backstop that completes the 3D glass
    // (its fill needs the volume actor's scalar texture, which trails the
    // actor itself); "StackSegmentationReady" covers the stack's first draw.
    const detachVolumeAttach = watchViewportVolumeAttach(refreshSelectionBoxes);
    cornerstone.eventTarget.addEventListener("VolumeReallyLoaded", handler);
    cornerstone.eventTarget.addEventListener("StackSegmentationReady", handler);

    // Redraw immediately so a left-click tool change re-renders any existing box
    // with the right interactivity (frozen vs. movable) without waiting for the
    // next segmentation edit. No-op when nothing has been drawn yet.
    refreshSelectionBoxes();

    return () => {
      detachVolumeAttach();
      cornerstone.eventTarget.removeEventListener("VolumeReallyLoaded", handler);
      cornerstone.eventTarget.removeEventListener(
        "StackSegmentationReady",
        handler,
      );
      cornerstone.eventTarget.removeEventListener(
        csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
        handler,
      );
      cornerstone.eventTarget.removeEventListener(
        MASK_LIVE_DRAW_EVENT,
        handleLiveDraw,
      );
      cornerstone.eventTarget.removeEventListener(
        MASK_DRAW_START_EVENT,
        handleDrawStart,
      );
      if (previewRaf) cancelAnimationFrame(previewRaf);
      // A drag that was still waiting on its 3D render when the exam changed
      // would otherwise leave its one-shot listener on the old element.
      preview3dElement?.removeEventListener(
        cornerstone.Enums.Events.IMAGE_RENDERED,
        onPreview3dRendered,
      );
      preview3dElement = null;
      // Clear the boxes so they don't linger onto the next segmentation / IEC.
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      renderingEngine?.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) removeMaskBox(item);
        else if (is2dViewport(item.id)) removeMaskBox2D(item);
      });
    };
    // `dispatch` is stable across renders, so listing it costs no extra runs.
    //
    // `isInitialized` is a dep for the seeded/restored selection: the draft or
    // submitted-mask seed applies DURING the load (MaskSegmentationReady /
    // StackSegmentationReady fire from inside initialize()), when the
    // viewports don't exist yet, so that data-modified refresh draws nothing.
    // Re-running this effect when isInitialized flips true — after the viewer
    // has mounted — is what guarantees the post-mount draw. Volumes also get
    // one from watchViewportVolumeAttach, but a stack viewport never fires
    // VOLUME_VIEWPORT_NEW_VOLUME, so without this dep the stack's seeded box
    // only appeared when load timings happened to land the events after the
    // mount.
  }, [
    iec,
    segmentationId,
    volumeId,
    volumetric,
    leftClickTool,
    maskVisible,
    isInitialized,
    dispatch,
  ]);

  // Live restyle for the mask opacity slider. Slider changes must not re-run
  // the effect above (its teardown/re-add rebuilds actors and re-renders the
  // volume twice per step, which made the slider unusable) — instead the
  // existing overlays are restyled in place: wireframe paint + fill transfer
  // functions on the 3D pane, element opacity on the 2D boxes. Coalesced to
  // one application per animation frame, latest value wins.
  useEffect(() => {
    if (!segmentationId || !maskVisible) return undefined;
    let raf = requestAnimationFrame(() => {
      raf = 0;
      const renderingEngine = cornerstone.getRenderingEngines()[0];
      if (!renderingEngine) return;
      renderingEngine.getViewports().forEach((item) => {
        if (is3dViewport(item.id)) {
          setMaskBoxStyle(item, {
            ...SELECTION_BOX_STYLE.box3d,
            opacity: maskOpacity,
          });
        } else if (is2dViewport(item.id)) {
          item.element?.__maskBox2dSetOpacity?.(maskOpacity);
        }
      });
    });
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [segmentationId, maskVisible, maskOpacity]);

  // The previously submitted mask's overlay — the amber box and everything
  // behind it (geometry resolution, prevMaskAvailable, draw/teardown, slider
  // restyle). Shared with the mask review route.
  usePreviousMaskOverlay({
    isInitialized,
    volumetric,
    volumeId,
    imageIds,
    maskingDetails,
  });

  // Per-exam memory for the mask box's appearance (see lib/maskViewPrefs).
  // What the restore last pushed into Redux, and whether Redux has caught up
  // with it yet.
  const maskViewAppliedRef = useRef(null);
  const maskViewSyncedRef = useRef(false);

  // Restore this exam's remembered slider/visibility as soon as it's shown.
  useEffect(() => {
    if (!iec) return;
    // Explicit default rather than whatever is in Redux right now: an exam
    // that has never been adjusted must open fully opaque, not inherit the
    // previous exam's setting. Navigation's resetOptions() normally lands the
    // same value, but it doesn't run for browser back/forward.
    const view = getMaskView(iec, DEFAULT_MASK_VIEW);
    maskViewAppliedRef.current = { iec: String(iec), ...view };
    maskViewSyncedRef.current = false;
    dispatch(setOption({ key: "maskOpacity", value: view.opacity }));
    dispatch(setOption({ key: "maskVisible", value: view.visible }));
    dispatch(setOption({ key: "prevMaskOpacity", value: view.prevOpacity }));
    dispatch(setOption({ key: "prevMaskVisible", value: view.prevVisible }));
  }, [iec, dispatch]);

  // Record changes the curator makes — but only for the exam the restore
  // above actually ran for, and only once its value has landed in Redux.
  // Both effects run in the same commit when the exam changes, and a dispatch
  // doesn't apply until the next render, so until then Redux still holds the
  // PREVIOUS exam's value; saving then would file that value under the new
  // exam and overwrite its real one.
  useEffect(() => {
    const applied = maskViewAppliedRef.current;
    if (!iec || applied?.iec !== String(iec)) return;
    if (!maskViewSyncedRef.current) {
      if (
        maskOpacity === applied.opacity &&
        maskVisible === applied.visible &&
        prevMaskOpacity === applied.prevOpacity &&
        prevMaskVisible === applied.prevVisible
      ) {
        maskViewSyncedRef.current = true;
      }
      return;
    }
    rememberMaskView(iec, {
      opacity: maskOpacity,
      visible: maskVisible,
      prevOpacity: prevMaskOpacity,
      prevVisible: prevMaskVisible,
    });
  }, [iec, maskOpacity, maskVisible, prevMaskOpacity, prevMaskVisible]);

  // Keep this exam's draft marker in the queue live: persist the current
  // selection on every edit so its row is flagged (and the "Active mask"
  // filter matches) the instant something is drawn — not only once the curator
  // navigates away. Empty edits (e.g. a stack clear) drop the draft the same
  // way, so the marker disappears immediately too.
  useEffect(() => {
    if (!iec || !segmentationId) return undefined;
    const handleEdit = (evt) => {
      if (evt.detail?.segmentationId !== segmentationId) return;
      // The seed's own apply fires this event too, and a selection still
      // equal to the seed isn't curator work (see seededBoundsRef). The first
      // real edit drops the ref, so a curator who later resizes back to the
      // exact seed coordinates still gets a draft like any other edit.
      if (seededBoundsRef.current) {
        if (selectionMatchesBounds(segmentationId, seededBoundsRef.current)) {
          return;
        }
        seededBoundsRef.current = null;
      }
      rememberMaskSelection(iec, segmentationId);
    };
    cornerstone.eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
      handleEdit,
    );
    return () => {
      cornerstone.eventTarget.removeEventListener(
        csToolsEnums.Events.SEGMENTATION_DATA_MODIFIED,
        handleEdit,
      );
    };
  }, [iec, segmentationId]);

  async function handleOperationAction(action) {
    switch (action) {
      case "clear":
        handleClear();
        break;
      case "accept":
        // Only advance when the mask was actually submitted.
        if (await handleAccept()) {
          // Submitted — this is no longer a pending draft. Drop it (and tell
          // the cleanup not to re-save from the still-drawn box) so its queue
          // row stops being flagged as an active selection.
          forgetMaskDraft(iec);
          skipDraftSaveRef.current = true;
          onNext();
        }
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
          // Terminal decision on this exam — discard any draft so it isn't
          // left flagged as having a pending selection.
          forgetMaskDraft(iec);
          skipDraftSaveRef.current = true;
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
    // Nothing is selected anymore — unflag this exam's queue row now. (The
    // volumetric branch below swaps in a fresh, empty segmentation without
    // firing a data-modified event, so the live listener wouldn't catch it.)
    forgetMaskDraft(iec);
    // The seed is gone with the selection; the empty state the curator chose
    // must not be mistaken for an untouched seed by the draft savers.
    seededBoundsRef.current = null;
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
      // removeSegmentation only drops tool state — free the old labelmap
      // volume too, or every Clear leaks a full-size volume into the cache.
      decacheVolume(segmentationId);
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
      activeSegmentationIdRef.current = newSegmentationId;
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
    return (
      <ViewportPlaceholder
        action={{ label: "Reload Image", onClick: handleReload }}
      />
    );
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
        <DetailsPanel
          details={transformDetails(details, maskingDetails)}
          onReload={handleReload}
        />
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
