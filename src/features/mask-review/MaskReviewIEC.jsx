import React from "react";

import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import {
  Enums,
  setMaskerReviewConfig,
  setStackConfig,
  setVolumeConfig,
  toggleLeftPanel,
  toggleRightPanel,
  reset,
} from "@/features/presentationSlice";

import { setTitle, setLoading, setOption } from "@/features/optionSlice";
import { useHotkeys } from "react-hotkeys-hook";
import { notify } from "@/lib/notify";
import { messages } from "@/lib/messages";

import createImageIdsAndCacheMetaData from "@/lib/createImageIdsAndCacheMetaData";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  isSegFlat,
  loadVolumeAndSegmentation,
  getIECInfo,
  makeRoomForExam,
  makeRoomForStackExam,
  startVolumeLoad,
} from "@/utilities";
import { getDicomDetails } from "@/visualreview";
import { getMaskingDetails, setMaskingStatus } from "@/masking.js";

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
import ViewportGridPlaceholder from "@/components/ViewportGridPlaceholder";

import "./MaskReviewIEC.css";

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

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
    download_path: `/papi/v1/masking/${details.image_equivalence_class_id}/reviewfiles/download`,
    download_name: `mask_review_${details.image_equivalence_class_id}.zip`,
  };
}

export default function MaskReviewIEC({
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

  // Hide the filter panel in the mask review VR route UI while keeping the
  // implementation intact. To bring it back, flip this to `true` and restore
  // grid-rows-[auto,1fr,auto] in MaskReviewIEC.css.
  const showFilterPanel = false;

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

  const [renderingEngine, setRenderingEngine] = useState(
    cornerstone.getRenderingEngine("re1"),
  );

  const [volumeId, setVolumeId] = useState();
  const [imageIds, setImageIds] = useState();

  const [toolGroup, setToolGroup] = useState();
  const [toolGroup3d, setToolGroup3d] = useState();
  const preset3d = useSelector((state) => state.options.preset);
  const optionsDecimate = useSelector((state) => state.options.decimate);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isErrored, setIsErrored] = useState(false);

  const [volumetric, setVolumetric] = useState(true);
  // null until fetched — the layout shell renders before these arrive, so the
  // details panel gates on them instead of assuming they exist.
  const [details, setDetails] = useState(null);
  const [maskingDetails, setMaskingDetails] = useState(null);
  const loadRequestRef = useRef(0);

  let viewer;

  /**
   * Setup the RenderingEngine and ToolGroup
   */

  // Fire a resize event whenever the right and left panels toggle
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [showLeftPanel, showRightPanel]);

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

  // Load the volume into the cache
  useEffect(() => {
    if (!iec) return; // nothing to load when IEC is not selected
    console.log("MaskReviewIEC useEffect[iec]:", iec);
    const requestId = ++loadRequestRef.current;
    let isCancelled = false;

    const initialize = async () => {
      // Don't show the previous exam's details while the new ones are fetched
      // — the layout shell stays mounted across IEC navigation.
      setDetails(null);
      setMaskingDetails(null);
      // Spinner up from the very first moment. The VR route also sets it on
      // IEC navigation, but the single-exam route doesn't set it at all —
      // and either way the load below is what takes it down.
      dispatch(setLoading(true));

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
      let volumeId = `mask-review-${iec}-decimate-${decimate_count}`;
      //let segmentationId = `mask-review-${iec}-seg`;

      const { frames } = await getIECInfo(iec, true, requestedDecimateCount);
      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> getIECInfo cancelled");
        return;
      }
      setImageIds(frames);

      setVolumeId(volumeId);
      setVolumetric(volumetric); // still update state
      //setSegmentationId(segmentationId);

      // Configure the UI for this exam type NOW — as soon as we know whether
      // it's a volume or a stack, and before the (slow) image load. This
      // fully populates the tools panel and operations bar behind the
      // spinner instead of leaving them empty until the load finishes.
      dispatch(reset());
      dispatch(setMaskerReviewConfig());
      if (volumetric) {
        dispatch(setTitle("Mask Volume Review"));
        dispatch(setVolumeConfig());
        dispatch(setOption({ key: "view", value: Enums.ViewOptions.VOLUME }));
      } else {
        dispatch(setTitle("Mask Stack Review"));
        dispatch(setStackConfig());
        dispatch(setOption({ key: "view", value: Enums.ViewOptions.STACK }));
      }
      dispatch(
        setOption({
          key: "leftClick",
          value: Enums.LeftClickOptions.WINDOW_LEVEL,
        }),
      );
      dispatch(
        setOption({ key: "rightClick", value: Enums.RightClickOptions.ZOOM }),
      );

      try {
        // for testing error handling
        if (volumetric) {
          // Keep previously visited exams cached (instant back-navigation),
          // but evict the least-recently-viewed ones if this one wouldn't fit.
          makeRoomForExam(frames, [volumeId]);
          const volume = await cornerstone.volumeLoader.createAndCacheVolume(
            volumeId,
            {
              imageIds: frames,
            },
          );
          // The completion callback — not the volume-shell creation above —
          // takes the spinner down, once the pixel data has actually
          // streamed in.
          startVolumeLoad(volume, () => {
            if (isCancelled || requestId !== loadRequestRef.current) return;
            dispatch(setLoading(false));
          });
          if (isCancelled || requestId !== loadRequestRef.current) {
            console.log("---------------> loadVolumeAndSegmentation cancelled");
            return;
          }
        } else {
          // The stack viewport loads the frames on demand as pinned wadouri
          // images; register them so the exam-LRU eviction can free them.
          makeRoomForStackExam(frames);
        }
        // throw new Error("This is a test error");
      } catch (error) {
        console.error(error);
        // A load abandoned by navigation may fail against torn-down state —
        // that's expected, not an error the user should see.
        if (isCancelled || requestId !== loadRequestRef.current) return;
        notify.error(error, messages.errors.loadImage);
        setIsErrored(true);
        // The load never completes, so its completion callback won't take
        // the spinner down — clear it here.
        dispatch(setLoading(false));
      }

      if (isCancelled || requestId !== loadRequestRef.current) {
        console.log("---------------> initialization cancelled after loading");
        return;
      }

      setIsInitialized(true);
      // Volume exams take the spinner down in the load-completion callback;
      // stack frames stream on demand into the mounted viewer — clear it
      // here for those.
      if (!volumetric) {
        dispatch(setLoading(false));
      }
    };

    setIsInitialized(false);
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
      // Leaving mid-load: the completion callback for this exam is stale and
      // will never clear the spinner — don't leave it up. A follow-up load
      // turns it straight back on.
      dispatch(setLoading(false));
    };
  }, [iec, optionsDecimate]);

  function handleFilterAction({
    maskingStatus: newMaskingStatus,
    dicomType: newDicomType,
  }) {
    navigate(
      `/mask/review/vr/${vr}/*/${newMaskingStatus || "All"}/${newDicomType || "All"}`,
    );
  }

  useHotkeys("a", () => handleOperationAction("accept mask"));
  useHotkeys("r", () => handleOperationAction("reject mask"));
  useHotkeys("s", () => handleOperationAction("skip mask"));
  useHotkeys("n", () => handleOperationAction("nonmaskable mask"));

  const MASK_REVIEW_MESSAGES = {
    "accept mask": messages.mask.accepted,
    "reject mask": messages.mask.rejected,
    "skip mask": messages.mask.skipped,
    "nonmaskable mask": messages.mask.notMaskable,
  };

  async function handleOperationAction(action) {
    const successMessage = MASK_REVIEW_MESSAGES[action];
    if (!successMessage) {
      console.warn(`Unknown action: ${action}`);
      return;
    }
    try {
      await setMaskingStatus(iec, action);
      notify.success(successMessage);
      onNext();
    } catch (error) {
      notify.error(error, messages.errors.saveStatus);
    }
  }

  if (!iec) {
    return (
      <RouteLayout
        routeName="mask-review-vr"
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

  // The layout shell (nav, tools panel, operations bar) renders immediately —
  // before the detail fetches and the image load — with the app-wide spinner
  // floating above it, exactly like MaskIEC. The viewer mounts once the
  // volume shell / frame list exists and its panes fill in as images stream.
  if (isErrored) {
    // Load failures are surfaced as a toast; keep the viewport itself clean
    // with a neutral placeholder so navigation still works.
    viewer = <ViewportPlaceholder />;
  } else if (isInitialized) {
    if (volumetric) {
      console.log(">>>>> about to pass volumeId=", volumeId);
      viewer = (
        <VolumeView
          volumeId={volumeId}
          preset3d={preset3d}
          toolGroup={toolGroup}
          toolGroup3d={toolGroup3d}
          modality={details?.modality}
          onToggleLeftPanel={handleToggleLeft}
          onToggleRightPanel={handleToggleRight}
        />
      );
    } else {
      viewer = (
        <StackView
          toolGroup={toolGroup}
          frames={imageIds}
          onToggleLeftPanel={handleToggleLeft}
          onToggleRightPanel={handleToggleRight}
        />
      );
    }
  } else {
    // Images still loading: show the empty viewport grid (a single pane for a
    // stack, 2×2 for a volume) so the layout is there from the first frame.
    // volumetric defaults to true before details arrive, so a volume shows
    // four panes immediately.
    viewer = <ViewportGridPlaceholder single={!volumetric} />;
  }

  return (
    <RouteLayout
      routeName={vr ? "mask-review-vr" : undefined}
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
        details && maskingDetails ? (
          <DetailsPanel details={transformDetails(details, maskingDetails)} />
        ) : (
          <div className="side-panel">
            <div className="wrapper" />
          </div>
        )
        // : null
      }
      showLeftPanel={showLeftPanel}
      showRightPanel={showRightPanel}
    />
  );
}
